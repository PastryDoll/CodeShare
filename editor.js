const socket = new WebSocket("ws://localhost:8080/ws");
const savedPassword = localStorage.getItem('adminPassword');
let password = null;
let clientId = null;

document.addEventListener("DOMContentLoaded", function() 
{
/////////UI-STUFF////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//
//// Divs control
//

    //Admin Panel
    {
        const adminPanelDiv = document.getElementById('adminPanel');
        const adminPanelResizer = document.getElementById('resizer-left')
    
        adminPanelResizer.addEventListener('mousedown', function(e) {
            e.preventDefault()
            window.addEventListener('mousemove', resizeLeft)
            window.addEventListener('mouseup', stopResizeLeft)
        })
    
        function resizeLeft(e) {
            const adminPanelComputedStyle = window.getComputedStyle(adminPanelDiv);
            const adminPanelResizerComputedStyle = window.getComputedStyle(adminPanelResizer);
            const padding = parseInt(adminPanelComputedStyle.paddingLeft); 
            const resizerWidth = parseInt(adminPanelResizerComputedStyle.width);
    
            adminPanelDiv.style.width = e.pageX - padding - resizerWidth + 'px';
        }
          
        function stopResizeLeft() {
            window.removeEventListener('mousemove', resizeLeft)
        }
    }

    // Client Panel
    {
        const clientPanelDiv = document.getElementById('clientsPanel');
        const clientPanelResizer = document.getElementById('resizer-right');
        
        let startX;
        let startWidth;
        
        clientPanelResizer.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            startWidth = parseInt(document.defaultView.getComputedStyle(clientPanelDiv).width, 10);
            document.documentElement.addEventListener('mousemove', resizePanel);
            document.documentElement.addEventListener('mouseup', stopResize);
        });
        
        function resizePanel(e) {
            const diffX = startX - e.clientX; 
            const newWidth = startWidth + diffX; 
        
            if (newWidth >= 150 && newWidth <= 500) {
                clientPanelDiv.style.width = `${newWidth}px`;
            }
        }
    }
    
    function stopResize() {
        document.documentElement.removeEventListener('mousemove', resizePanel);
        document.documentElement.removeEventListener('mouseup', stopResize);
    }
    
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// 
//// Set default code editor theme and params.
//  
    var editor_element = document.getElementById("editor")
    var editor = CodeMirror.fromTextArea(editor_element, {
        mode: "python", 
        lineNumbers: true, 
        theme: "dracula", 
        tabSize: 4 
    });
    
    editor.setValue('import time\nprint("Hello, World!")\nprint("Waiting...")\ntime.sleep(3)\nprint("Done!")');
    editor.setSize("100%","100%");

    let clients = null;
    let isAdmin = false;
    console.log("Your saved password is:", savedPassword);

    socket.onmessage = function(event) 
    {
        let data = JSON.parse(event.data);
        
        console.log("Got message: ", data)
        
        if (data.Action == "authenticated")
        {
            if (data.ClientId == clientId) {showAdminNotification("You are now the admin and editor!", true,true); isAdmin = true; populateClients(clients, isAdmin);};
        }
        else if (data.Action == "deauthenticated")
        {
            if (data.ClientId == clientId) {showAdminNotification("You are not admin anymore", false,false); isAdmin = false; populateClients(clients, isAdmin);};
        }
        else if (data.Action == "hello") 
        {
            clients = (data.Clients === 0 || data.Clients === undefined) ? " " : data.Clients;
            populateClients(clients, isAdmin);
            if (!clientId)
            {
                clientId = data.ClientId;
                console.log("Your id is", clientId);
                if (data.Password) 
                {
                    console.log("Your password is:", data.Password);
                    localStorage.setItem('adminPassword', data.Password);
                    document.getElementById('adminPassword').value = data.Password;
                }
                if (savedPassword) 
                {
                    sendPassword(savedPassword);
                }
            }

        } 
        else if (data.Action == "byebye")
        {
            clients = (data.Clients === 0 || data.Clients === undefined) ? " " : data.Clients;
            populateClients(clients);
        }
        else if (data.Action == "transfer")
        {
            if (data.TransferId == clientId) {setEditor(true);}
        }
        else if (data.Action == "code")
        {
            editor.setValue(data.code);
            // editor.setCursor({line: 1, ch: 5})
        }
    };
    
    socket.onopen = function() {
        console.log("Connected to WebSocket server");
    };
    
    socket.onerror = function(error) {
        console.error("WebSocket error:", error);
    };
    
    socket.onclose = function() {
        console.log("WebSocket connection closed");
    };
    
    editor.on("change", function(instance, changeObj) {
        console.log(changeObj)
        var code = instance.getValue();
        if (clientId && (changeObj.origin == "+input" || changeObj.origin == "+delete")) {
            console.log("Sending message")
            socket.send(JSON.stringify({ Code: code, ClientId: clientId }));
        }
    });

    var outputElement = document.getElementById("output");
    // 
    //// Effect of pressing the run code button. This should send the code to the server and. receive the 
    //   output stream and update the output window. 
    document.getElementById("runButton").addEventListener("click", function() {
        runButton.disabled = true;
        var code = editor.getValue();
        outputElement.textContent = "Processing...";

        // @NOTE So I tried XHR but... It works for Safari, but not for Chrome.. It looks like the problem is that Chrome
        // has a bigger buffer for the message and so the output dont feels smooth --Caio.
        let FirstRead = true;

        // Send code and handle output
        fetch("/run", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ code: code })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("Network response was not ok " + response.statusText);
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            var count = 0;
            function readStream() {
                return reader.read().then(({ done, value }) => {
                    if (done) {
                        return;
                    }
                    const newText = decoder.decode(value, { stream: true });
                    if (FirstRead) {
                        outputElement.textContent = ""; 
                        FirstRead = false; 
                    }
                    outputElement.textContent += newText;
                    count += 1;
                    console.log("Stream open", count);
                    return readStream();
                });
            }

            return readStream();
        })
        .then(() => runButton.disabled = false)
        .catch(error => {
            document.getElementById("output").textContent = "Error: " + error.message;
        });
    });

    document.getElementById("sendPassword").addEventListener("click", function() {
    sendPassword(null)
    })
});

function sendPassword(password) {
    var pass = password || document.getElementById('adminPassword').value;
    password = pass;
    console.log("Sending password", pass, "to server, my id is: ", clientId);
    if (pass && socket) {
        socket.send(JSON.stringify({
            ClientId: clientId,
            Action: "authenticate",
            Password: pass
        }));
    }
}

function closeAdminMessage() {
    document.getElementById('adminMessage').style.display = 'none';
}
function showAdminNotification(text,isAdmin, isEditor) {
    var adminMessageDiv = document.getElementById('adminMessage');
    adminMessageDiv.style.display = 'block'; 

    if (isAdmin) {
        adminMessageDiv.style.backgroundColor = '#e0ffe0'; 
        adminMessageDiv.style.borderColor = '#00b300';     
    }
    else {
        adminMessageDiv.style.backgroundColor = '#ee0000'; 
        adminMessageDiv.style.borderColor = '#ee0000';     
    }
    adminMessageDiv.innerHTML = `
    <button id="closeAdminMessage" onclick="closeAdminMessage()">X</button>
    <div class="messageText">${text}</div> <!-- Use a separate div for text -->
    `; 
    setAdmin(isAdmin); 
    setEditor(isEditor); 
    console.log(text);
}

function setAdmin(isAdmin){
    let statusCircleAdmin = document.getElementById('adminStatus');
    if (isAdmin) {
        statusCircleAdmin.style.backgroundColor = 'green';
    } else {
        statusCircleAdmin.style.backgroundColor = 'red';
    }
}

function setEditor(isEditor){
    let statusCircleEditor = document.getElementById('editorStatus');

    if (isEditor) {
        statusCircleEditor.style.backgroundColor = 'green';
    } else {
        statusCircleEditor.style.backgroundColor = 'red';
    }

}

function populateClients(clients,isAdmin) {
    const clientsList = document.getElementById('clientsList');
    clientsList.innerHTML = ''; 
    const clientsList_ids = clients.split(",")
    console.log("Im admin? ",isAdmin,"client_list:", clientsList_ids, clients)
    clientsList_ids.forEach((client, index) => {
        const li = document.createElement('li');
        const label = document.createElement('label');
        label.innerText = client;
        
        if (isAdmin)
        {
            const radioButton = document.createElement('input');
            radioButton.type = 'radio';
            radioButton.name = 'clientToggle'; 
            radioButton.value = client;
            radioButton.id = `client-${index}`;
    
            radioButton.addEventListener('change', (event) => {
                handleClientToggle(event.target.value); 
            });
            li.appendChild(radioButton);
        }

        li.appendChild(label);

        clientsList.appendChild(li);
    });
}

function handleClientToggle(selectedClient) {
    socket.send(JSON.stringify({
        ClientId: clientId,
        Action: "transfer",
        Password: password,
        TransferId : selectedClient
    }));
    console.log(`Client ${selectedClient} has been selected.`);
}