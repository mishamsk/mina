package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/mishamsk/mina/internal/appconfig"
	"github.com/mishamsk/mina/internal/runtime"
)

const restartNotice = "Authentication changes take effect after Mina restarts."

func newAuthCommand(stdin io.Reader, stdout io.Writer, stderr io.Writer, configFilePath *string) *cobra.Command {
	reader := bufferedReader(stdin)
	cmd := &cobra.Command{
		Use:          "auth",
		Short:        "Manage the configured authentication file",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return cmd.Help()
		},
	}
	cmd.AddCommand(newAuthInitCommand(stdin, reader, stdout, stderr, configFilePath))
	cmd.AddCommand(newAuthUserCommand(stdin, reader, stdout, stderr, configFilePath))
	cmd.AddCommand(newAuthAPIKeyCommand(stdout, configFilePath))
	return cmd
}

func newAuthInitCommand(stdin io.Reader, reader *bufio.Reader, stdout io.Writer, stderr io.Writer, configFilePath *string) *cobra.Command {
	return &cobra.Command{
		Use:          "init <email>",
		Short:        "Initialize the configured authentication file and first user",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			manager, err := loadAuthManager(configFilePath)
			if err != nil {
				return err
			}
			password, err := readNewPassword(stdin, reader, stderr)
			if err != nil {
				return err
			}
			user, err := manager.Initialize(args[0], password)
			clear(password)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(stdout, "Initialized %s with user %s (%s).\n%s\n", manager.Path(), user.Email, user.ID, restartNotice)
			return err
		},
	}
}

func newAuthUserCommand(stdin io.Reader, reader *bufio.Reader, stdout io.Writer, stderr io.Writer, configFilePath *string) *cobra.Command {
	cmd := &cobra.Command{Use: "user", Short: "Manage authentication users", Args: cobra.NoArgs, SilenceUsage: true, RunE: func(cmd *cobra.Command, _ []string) error {
		return cmd.Help()
	}}
	cmd.AddCommand(&cobra.Command{
		Use: "list", Short: "List authentication users", Args: cobra.NoArgs, SilenceUsage: true,
		RunE: func(_ *cobra.Command, _ []string) error {
			manager, err := loadAuthManager(configFilePath)
			if err != nil {
				return err
			}
			users, err := manager.Users()
			if err != nil {
				return err
			}
			for _, user := range users {
				if _, err := fmt.Fprintf(stdout, "%s\t%s\tenabled=%t\tsession_version=%d\n", user.ID, user.Email, user.Enabled, user.SessionVersion); err != nil {
					return err
				}
			}
			return nil
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use: "add <email>", Short: "Add an enabled authentication user", Args: cobra.ExactArgs(1), SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			manager, err := loadAuthManager(configFilePath)
			if err != nil {
				return err
			}
			password, err := readNewPassword(stdin, reader, stderr)
			if err != nil {
				return err
			}
			user, err := manager.AddUser(args[0], password)
			clear(password)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(stdout, "Added user %s (%s).\n%s\n", user.Email, user.ID, restartNotice)
			return err
		},
	})
	cmd.AddCommand(newAuthUserEnabledCommand(stdout, configFilePath, true))
	cmd.AddCommand(newAuthUserEnabledCommand(stdout, configFilePath, false))
	cmd.AddCommand(&cobra.Command{
		Use: "set-password <user-id-or-email>", Short: "Change a user's password and revoke prior sessions", Args: cobra.ExactArgs(1), SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			manager, err := loadAuthManager(configFilePath)
			if err != nil {
				return err
			}
			password, err := readNewPassword(stdin, reader, stderr)
			if err != nil {
				return err
			}
			user, err := manager.SetPassword(args[0], password)
			clear(password)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(stdout, "Changed password for %s; session version is now %d.\n%s\n", user.Email, user.SessionVersion, restartNotice)
			return err
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use: "revoke-sessions <user-id-or-email>", Short: "Revoke all browser sessions for a user", Args: cobra.ExactArgs(1), SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			manager, err := loadAuthManager(configFilePath)
			if err != nil {
				return err
			}
			user, err := manager.RevokeSessions(args[0])
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(stdout, "Revoked sessions for %s; session version is now %d.\n%s\n", user.Email, user.SessionVersion, restartNotice)
			return err
		},
	})
	return cmd
}

func newAuthUserEnabledCommand(stdout io.Writer, configFilePath *string, enabled bool) *cobra.Command {
	name := "disable"
	short := "Disable an authentication user"
	if enabled {
		name, short = "enable", "Enable an authentication user"
	}
	return &cobra.Command{
		Use: name + " <user-id-or-email>", Short: short, Args: cobra.ExactArgs(1), SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			manager, err := loadAuthManager(configFilePath)
			if err != nil {
				return err
			}
			user, err := manager.SetUserEnabled(args[0], enabled)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(stdout, "Set user %s enabled=%t.\n%s\n", user.Email, user.Enabled, restartNotice)
			return err
		},
	}
}

func newAuthAPIKeyCommand(stdout io.Writer, configFilePath *string) *cobra.Command {
	cmd := &cobra.Command{Use: "api-key", Short: "Manage API keys", Args: cobra.NoArgs, SilenceUsage: true, RunE: func(cmd *cobra.Command, _ []string) error {
		return cmd.Help()
	}}
	cmd.AddCommand(&cobra.Command{
		Use: "list", Short: "List API keys", Args: cobra.NoArgs, SilenceUsage: true,
		RunE: func(_ *cobra.Command, _ []string) error {
			manager, err := loadAuthManager(configFilePath)
			if err != nil {
				return err
			}
			keys, err := manager.APIKeys()
			if err != nil {
				return err
			}
			for _, key := range keys {
				if _, err := fmt.Fprintf(stdout, "%s\t%s\tprefix=%s\n", key.ID, key.Label, key.Prefix); err != nil {
					return err
				}
			}
			return nil
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use: "create <label>", Short: "Create an API key and reveal it once", Args: cobra.ExactArgs(1), SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			manager, err := loadAuthManager(configFilePath)
			if err != nil {
				return err
			}
			key, token, err := manager.CreateAPIKey(args[0])
			if err != nil {
				return err
			}
			if _, err := fmt.Fprintf(stdout, "Created API key %s (%s).\nAPI key (shown once): %s\n%s\n", key.Label, key.ID, token, restartNotice); err != nil {
				if _, revokeErr := manager.RevokeAPIKey(key.ID); revokeErr != nil {
					return errors.Join(err, fmt.Errorf("remove API key after output failure: %w", revokeErr))
				}
				return err
			}
			return nil
		},
	})
	cmd.AddCommand(&cobra.Command{
		Use: "revoke <key-id-or-prefix>", Short: "Revoke an API key", Args: cobra.ExactArgs(1), SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			manager, err := loadAuthManager(configFilePath)
			if err != nil {
				return err
			}
			key, err := manager.RevokeAPIKey(args[0])
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(stdout, "Revoked API key %s (%s).\n%s\n", key.Label, key.ID, restartNotice)
			return err
		},
	})
	return cmd
}

func loadAuthManager(configFilePath *string) (*runtime.AuthenticationAdministration, error) {
	path := ""
	if configFilePath != nil {
		path = *configFilePath
	}
	cfg, err := appconfig.Load(appconfig.LoadOptions{ConfigFilePath: path}, appconfig.Overrides{})
	if err != nil {
		return nil, err
	}
	return runtime.NewAuthenticationAdministration(cfg)
}

func readNewPassword(stdin io.Reader, reader *bufio.Reader, stderr io.Writer) ([]byte, error) {
	password, err := readSecret(stdin, reader, stderr, "Password: ")
	if err != nil {
		return nil, err
	}
	confirmation, err := readSecret(stdin, reader, stderr, "Confirm password: ")
	if err != nil {
		clear(password)
		return nil, err
	}
	defer clear(confirmation)
	if string(password) != string(confirmation) {
		clear(password)
		return nil, errors.New("passwords do not match")
	}
	return password, nil
}

func readSecret(stdin io.Reader, reader *bufio.Reader, stderr io.Writer, prompt string) ([]byte, error) {
	if _, err := fmt.Fprint(stderr, prompt); err != nil {
		return nil, err
	}
	if descriptor, ok := stdin.(interface{ Fd() uintptr }); ok && term.IsTerminal(int(descriptor.Fd())) {
		secret, err := term.ReadPassword(int(descriptor.Fd()))
		_, newlineErr := fmt.Fprintln(stderr)
		if err != nil {
			return nil, fmt.Errorf("read secret: %w", err)
		}
		if newlineErr != nil {
			clear(secret)
			return nil, newlineErr
		}
		return secret, nil
	}
	value, err := reader.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("read secret: %w", err)
	}
	if errors.Is(err, io.EOF) && value == "" {
		return nil, errors.New("read secret: unexpected end of input")
	}
	return []byte(strings.TrimSuffix(strings.TrimSuffix(value, "\n"), "\r")), nil
}

func bufferedReader(reader io.Reader) *bufio.Reader {
	if buffered, ok := reader.(*bufio.Reader); ok {
		return buffered
	}
	return bufio.NewReader(reader)
}
