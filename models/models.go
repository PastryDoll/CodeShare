package models

type LoginMessage struct {
	ClientKey string `json:"ClientKey"`
	Code      string `json:"Code"`
	CodeId    int    `json:"CodeId"`
}

type Position struct {
	Line int `json:"line"`
	Ch   int `json:"ch"`
}

type Change struct {
	From Position `json:"from"`
	To   Position `json:"to"`
	Text []string `json:"text"`
	Id   uint64   `json:"id"`
}

type Message struct {
	ChatMsg    string `json:"ChatMsg,omitempty"`
	ClientId   string `json:"ClientId,omitempty"`
	AdminId    string `json:"AdminId,omitempty"`
	Action     string `json:"Action,omitempty"`
	Password   string `json:"Password,omitempty"`
	Clients    string `json:"Clients,omitempty"`
	TransferId string `json:"TransferId,omitempty"`
	AdminKey   string `json:"AdminKey,omitempty"`
	EditorKey  string `json:"EditorKey,omitempty"`

	// Code Changes
	Code    string `json:"Code,omitempty"`
	Changes Change `json:"Changes,omitempty"`
}
