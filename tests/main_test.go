package tests

import (
	"CodeShare/models"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
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

func WSToQueue(wsConn *websocket.Conn, ReceivesChan chan map[string]interface{}, errorChan chan error, user string) {
	for {
		_, message, err := wsConn.ReadMessage()
		if err != nil {
			errorChan <- fmt.Errorf("!!!!!!!!Error reading message: %v", err)
			return
		}
		var genericMessage map[string]interface{}
		err = json.Unmarshal(message, &genericMessage)
		if err != nil {
			errorChan <- fmt.Errorf("!!!!!!!!Error decoding JSON message: %v", err)
			continue
		}
		genericMessage["Receiver"] = user
		ReceivesChan <- genericMessage
	}
}
func SendChanges(wsConn *websocket.Conn, clientId string) {

	for i := 0; i < 10; i++ {
		change := models.Change{
			From: models.Position{Line: 0, Ch: i},
			To:   models.Position{Line: 0, Ch: i},
			Text: []string{"a"},
			Id:   uint64(i),
		}
		message := models.Message{
			ClientId: clientId,
			Changes:  change,
			Action:   "codechange",
		}

		if err := wsConn.WriteJSON(message); err != nil {
			log.Printf("Error sending message: %v", err)
		}
		time.Sleep(time.Second / 10)

	}
	time.Sleep(time.Second)

}

func TestServer(t *testing.T) {
	users := map[string]*websocket.Conn{"First": nil, "Second": nil}
	errorChan := make(chan error, 100)
	ReceivesChan := make(chan map[string]interface{}, 1000)

	for user, _ := range users {
		go func(user string) {
			wsConn := LoginAndWs(t, user)
			users[user] = wsConn
			defer wsConn.Close()

			go WSToQueue(wsConn, ReceivesChan, errorChan, user)
			time.Sleep(time.Second * 20)
		}(user)
	}

	var admin string = ""

loop:
	for {
		select {
		case message, ok := <-ReceivesChan:
			if !ok {
				fmt.Printf("!!!!!!!!!!!!ERROR\n")
				break loop
			}
			if message["Action"] == "password" {
				user := message["Receiver"].(string)
				admin = user
				fmt.Printf("Admin is %s, starting to send changes\n", user)
				go SendChanges(users[user], user)
			}
			if message["Receiver"] != admin {
				fmt.Printf("Non admin Received queue: %+v\n", message)
			}
		case err := <-errorChan:
			t.Fatalf("Received error from %v", err)
		}
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
