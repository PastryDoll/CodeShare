let chatHistory = 
{
    model: "professor",
    messages: []
};

function addNewMessage(role, content)
{
    chatHistory.messages.push({role,content})
    const currHistory = chatHistory.messages.slice();
    console.log("Current chat history:", currHistory)
}

function cleanHistory() {
    chatHistory = 
    {
        model: "professor",
        messages: []
    };
}

function sendNewMessage(outputElement) 
{
    let AIResponse = ""
        fetch("http://localhost:11434/api/chat", 
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(chatHistory)
        })
        .then(response => 
        {
            if (!response.ok) 
            {
                throw new Error("Network response was not ok " + response.statusText);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            function readStream() 
            {   
                return reader.read().then(({ done, value }) => 
                {
                    if (done)
                    {
                        addNewMessage("assistant", AIResponse);
                        return;
                    }
                    let newElement = decoder.decode(value, { stream: true });
                    newElement =  JSON.parse(newElement).message.content;
                    AIResponse += newElement;
                    outputElement.innerHTML = `<strong style="color: #FF6666">AI Assistant:</strong> ${AIResponse}`
                    return readStream();
                });
            }
            return readStream();
        })  
        .catch(error => {console.log("Error: " + error.message)});
    
}

export {sendNewMessage, addNewMessage}