//go:build !unix

package main

import (
	"os"
	"os/exec"
)

func configureProcessGroup(cmd *exec.Cmd) {}

func terminateProcess(process *os.Process) {
	_ = process.Kill()
}
