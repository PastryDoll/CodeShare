package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
)

func TestServer(t *testing.T) {
	serverURL := "http://localhost:8080"
	loginEndpoint := "/login"
	wsEndpoint := "/ws"

	username := "testUser"
	clientKey := "testKey"

	// Step 1: Send a POST request to /login
	loginData := map[string]string{"userName": username}
	loginBody, _ := json.Marshal(loginData)

	resp, err := http.Post(serverURL+loginEndpoint, "application/json", bytes.NewBuffer(loginBody))
	if err != nil {
		t.Fatalf("Failed to send login request: %v", err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Failed to read login response body: %v", err)
	}

	fmt.Printf("Login Response: %s\n", string(body))

	assert.Equal(t, http.StatusOK, resp.StatusCode, "Expected HTTP 200 OK response")

	// Step 2: Connect to the WebSocket
	wsURL := "ws://localhost:8080" + wsEndpoint + "?clientId=" + username + "&clientKey=" + clientKey
	wsConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	defer wsConn.Close()

	// Step 3: Send continuous messages
	go func() {
		for i := 0; i < 5; i++ {
			messageData := map[string]interface{}{
				"Changes":  map[string]string{"key": "value"},
				"Action":   "codechange",
				"ClientId": username,
			}
			msgBytes, _ := json.Marshal(messageData)

			err := wsConn.WriteMessage(websocket.TextMessage, msgBytes)
			if err != nil {
				log.Printf("Failed to send WebSocket message: %v", err)
				return
			}

			time.Sleep(1 * time.Second) // Simulate periodic sending
		}
	}()

	// Step 4: Read response from WebSocket
	_, message, err := wsConn.ReadMessage()
	if err != nil {
		t.Fatalf("Failed to read message from WebSocket: %v", err)
	}

	log.Printf("Received message from server: %s", string(message))
	assert.NotEmpty(t, message, "Expected a response from WebSocket")

	// Allow some time for the test to complete
	time.Sleep(3 * time.Second)
}
