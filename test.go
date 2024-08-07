// package main

// import (
// 	"bufio"
// 	"fmt"
// 	"os/exec"
// )

// func main() {
// 	pythonCode := `
// import time
// print("Hello")
// time.sleep(1)
// print("World")`

// 	cmd := exec.Command("python", "-uc", pythonCode)

// 	stdout, _ := cmd.StdoutPipe()
// 	cmd.Start()

// 	scanner := bufio.NewScanner(stdout)
// 	for scanner.Scan() {
// 		m := scanner.Text()
// 		fmt.Println(m)
// 	}
// 	cmd.Wait()
// }

package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
)

func main() {
	pythonCode := `
import time
print("Hello")
time.sleep(1)
print("World")
`
	fmt.Println("Hi")

	// Create the command
	cmd := exec.Command("python", "-uc", pythonCode)

	// Get the standard output pipe
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		fmt.Println("Error getting stdout pipe:", err)
		return
	}

	// Start the command
	if err := cmd.Start(); err != nil {
		fmt.Println("Error starting command:", err)
		return
	}

	// Copy the output to os.Stdout
	if _, err := io.Copy(os.Stdout, stdout); err != nil {
		fmt.Println("Error copying output:", err)
	}

	// Wait for the command to complete
	if err := cmd.Wait(); err != nil {
		fmt.Println("Error waiting for command:", err)
	}
}
