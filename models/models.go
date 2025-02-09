package models

type LoginMessage struct {
	ClientKey  string `json:"ClientKey"`
	Code       string `json:"Code"`
	CodeId     int    `json:"CodeId"`
	ClientList string `json:"ClientList"`
}
