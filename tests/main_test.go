package tests

import (
	"CodeShare/models"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
)

const (
	SERVERURL string = "http://localhost:8080"
	LOGINURL  string = "/login"
	WSURL     string = "/ws"
)

func login(t *testing.T, userName string) []byte {
	loginData := map[string]string{"userName": userName}
	loginBody, _ := json.Marshal(loginData)

	resp, err := http.Post(SERVERURL+LOGINURL, "application/json", bytes.NewBuffer(loginBody))
	if err != nil {
		t.Fatalf("Failed to send login request: %v", err)
	}

	assert.Equal(t, http.StatusOK, resp.StatusCode, "Expected HTTP 200 OK response")
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("Failed to read login response body: %v", err)
	}

	return body

}

func LoginAndWs(t *testing.T, userName string) *websocket.Conn {

	//
	//// Login
	//
	var loginBody models.LoginMessage
	response := login(t, userName)
	err := json.Unmarshal(response, &loginBody)
	if err != nil {
		t.Fatalf("Error decoding JSON: %v", err)
	}
	fmt.Printf("Login Response: %+v\n", loginBody)

	//
	//// connect to WebSocket
	//
	wsURL := "ws://localhost:8080" + WSURL + "?clientId=" + userName + "&clientKey=" + loginBody.ClientKey
	fmt.Println("Connecting with: ", wsURL)
	wsConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to connect to WebSocket: %v", err)
	}
	return wsConn

}

func WSToQueue(wsConn *websocket.Conn, messageChan chan map[string]interface{}, errorChan chan error) {
	for {
		_, message, err := wsConn.ReadMessage()
		if err != nil {
			errorChan <- fmt.Errorf("Error reading message: %v", err)
			return
		}
		var genericMessage map[string]interface{}
		err = json.Unmarshal(message, &genericMessage)
		if err != nil {
			errorChan <- fmt.Errorf("Error decoding JSON message: %v", err)
			continue
		}
		fmt.Printf("Received JSON Message: %+v\n", genericMessage)
		messageChan <- genericMessage
	}
}

func TestServer(t *testing.T) {
	users := []string{"TestFirstUser", "TestSecondUser", "TestThirdUser"}
	errorChan := make(chan error)

	for _, user := range users {
		go func(user string) {
			wsConn := LoginAndWs(t, user)
			defer wsConn.Close()

			messageChan := make(chan map[string]interface{})
			WSToQueue(wsConn, messageChan, errorChan)
		}(user)
	}

	select {
	case err := <-errorChan:
		t.Fatalf("Received error from %v", err)
	}
	time.Sleep(time.Second * 5)
}

// expectedMessages := map[string]bool{"password": false, "sayhello": false}
// timeout := time.After(10 * time.Second)
// for {
// 	select {
// 	case message, ok := <-messageChan:
// 		if !ok {
// 			return
// 		}

// 		var genericMessage map[string]interface{}
// 		err := json.Unmarshal(message, &genericMessage)
// 		if err != nil {
// 			fmt.Println("Error decoding JSON message:", err)
// 			continue
// 		}
// 		fmt.Printf("Received JSON Message: %+v\n", genericMessage)

// 		// Extract action
// 		action, ok := genericMessage["Action"].(string)
// 		if !ok {
// 			fmt.Println("Received message with no valid action")
// 			continue
// 		}

// 		// Process message
// 		switch action {
// 		case "password":
// 			if password, ok := genericMessage["Password"].(string); ok && password == "123" {
// 				expectedMessages["password"] = true
// 			}
// 		case "sayhello":
// 			adminID, hasAdminID := genericMessage["AdminId"]
// 			clientID, hasClientID := genericMessage["ClientId"]
// 			clientList, hasClientList := genericMessage["Clients"]

// 			fmt.Printf("Received sayhello message with adminId: %v, ClientId: %v, Clients: %v\n", adminID, clientID, clientList)
// 			if hasAdminID && hasClientID && hasClientList {
// 				expectedMessages["sayhello"] = true
// 			}
// 		}

// 		// Check if all expected messages are received
// 		// if expectedMessages["password"] && expectedMessages["sayhello"] {
// 		// 	fmt.Println("All expected messages received!")
// 		// 	return
// 		// }

// 	case <-timeout:
// 		t.Fatalf("Timeout waiting for expected messages: %v", expectedMessages)
// 		return
// 	}
// }

// // Step 3: Send continuous messages
// go func() {
// 	for i := 0; i < 5; i++ {
// 		messageData := map[string]interface{}{
// 			"Changes":  map[string]string{"key": "value"},
// 			"Action":   "codechange",
// 			"ClientId": username,
// 		}
// 		msgBytes, _ := json.Marshal(messageData)

// 		err := wsConn.WriteMessage(websocket.TextMessage, msgBytes)
// 		if err != nil {
// 			log.Printf("Failed to send WebSocket message: %v", err)
// 			return
// 		}

// 		time.Sleep(1 * time.Second) // Simulate periodic sending
// 	}
// }()

// // Step 4: Read response from WebSocket
// _, message, err := wsConn.ReadMessage()
// if err != nil {
// 	t.Fatalf("Failed to read message from WebSocket: %v", err)
// }

// log.Printf("Received message from server: %s", string(message))
// assert.NotEmpty(t, message, "Expected a response from WebSocket")

// // Allow some time for the test to complete
// time.Sleep(3 * time.Second)
// }
