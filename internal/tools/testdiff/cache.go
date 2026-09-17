package main

import (
	"encoding/gob"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Gob preserves internal fields such as frontend end lines, which the public
// JSON report intentionally omits. Bump main-v2 when inventory semantics change.
func readInventoryCache(path string) (inventory, bool, error) {
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return inventory{}, false, nil
	}
	if err != nil {
		return inventory{}, false, fmt.Errorf("open main inventory cache: %w", err)
	}
	defer func() { _ = file.Close() }()
	var cached inventory
	if err := gob.NewDecoder(file).Decode(&cached); err != nil || cached.Go == nil || cached.Frontend == nil || cached.Scripts == nil {
		fmt.Fprintf(os.Stderr, "Rebuilding invalid main inventory cache: %s\n", path)
		return inventory{}, false, nil
	}
	return cached, true, nil
}

func writeInventoryCache(path string, data inventory) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create main inventory cache directory: %w", err)
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".inventory-*")
	if err != nil {
		return fmt.Errorf("create main inventory cache: %w", err)
	}
	defer func() { _ = os.Remove(file.Name()) }()
	if err := gob.NewEncoder(file).Encode(data); err != nil {
		_ = file.Close()
		return fmt.Errorf("encode main inventory cache: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close main inventory cache: %w", err)
	}
	if err := os.Rename(file.Name(), path); err != nil {
		return fmt.Errorf("publish main inventory cache: %w", err)
	}
	return nil
}
