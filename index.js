import { sendNewMessage, addNewMessage } from './components/ai_assistant_history.js';

// Global state
// TODO(CAIO) - Clean up global variables that dont need to be global
const savedPassword = localStorage.getItem('adminPassword');
console.log("Your saved password is:", savedPassword);
let socket = null; // Only modified at initSocket()
let password = null; // Modified on SendPassword
let clientId = null;  // Modified in hello
let adminId = null; // Modified in authenticated and say hello
let clients = null; // Modified in byebye and sayhello
let userName = null; // Modified in Username initial window
let editor = null; // Modified in editor
let clientColors = {}; // Modified in getClientColor

document.addEventListener("DOMContentLoaded", function() 
{

// Init hot DOM elements
const AIchatMessages = document.getElementById('messages-ai');
const chatMessages = document.getElementById('messages');

// Username initial window
{
    const modal = document.getElementById("usernameModal");
    const submitBtn = document.getElementById("submitBtn");
    submitBtn.addEventListener("click", async function() 
    {
        const usernameInput = document.getElementById("usernametext").value;
        if (usernameInput) {
            userName = usernameInput;
            initSocket(userName, chatMessages);       
        } else {
            alert("This user name is in use or invalid");
        }
    });
}

// Webcam
{
    const video = document.getElementById('video');
    let stream
    async function startCamera() {
        try {
            const constraints = {
                video: {
                    facingMode: 'user', 
                    width: { ideal: 1280 }, 
                    height: { ideal: 720 }, 
                    frameRate: { ideal: 30, max: 60 } 
                }
            };
            
            // stream = await navigator.mediaDevices.getUserMedia(constraints);
            // video.srcObject = stream
        } catch (error) {
            console.error('Error accessing the camera: ', error);
            alert('Unable to access camera. Please check your permissions.');
        }
    }

    function stopCamera()
    {
        if (stream) 
        {
            video.srcObject = null;
        }
    }
    startCamera()
}

// Chat
{
    const sendButton = document.getElementById('send');
    const messageInput = document.getElementById('message');
    
    sendButton.onclick = function() {
        const message = messageInput.value;
        if (message) {
            console.log("Sending message:", message);
            socket.send(JSON.stringify({ ChatMsg: message, ClientId: clientId, Action: "chat" }));
            messageInput.value = '';  // Clear the input field
        }
    };

    document.getElementById('chat-header').addEventListener('click', function() {
        const chatTab = document.getElementById('chat-tab');
        const isCollapsed = chatTab.classList.contains('collapsed');

        chatTab.classList.remove('collapsed', 'expanded');

        if (isCollapsed) {
            chatTab.style.overflow = 'hidden';
            chatTab.classList.add('expanded');
            setTimeout(function() {
                chatTab.style.overflow = 'visible'; 
            }, 300); 
        } else {
            chatTab.classList.add('collapsed');
            chatTab.style.overflow = 'hidden';
        }
    });
}

// AI Chat
{
    const sendButton = document.getElementById('send-ai');
    const messageInput = document.getElementById('message-ai');
    
    sendButton.onclick = function() {
        const message = messageInput.value;
        if (message) {
            console.log("Sending message:", message);
            addMessageAiChatWindow(message, AIchatMessages, "You", "#6666ff");
            let aiMessageElement = addMessageAiChatWindow("...", AIchatMessages, "AI Assistant", "#ff6666");
            addNewMessage('user', message);
            sendNewMessage(aiMessageElement);
            messageInput.value = ''; 

        }
    };

    document.getElementById('ai-header').addEventListener('click', function() {
        const chatTab = document.getElementById('ai-tab');
        const isCollapsed = chatTab.classList.contains('collapsed');

        chatTab.classList.remove('collapsed', 'expanded');

        if (isCollapsed) {
            chatTab.style.overflow = 'hidden';
            chatTab.classList.add('expanded');
            setTimeout(function() {
                chatTab.style.overflow = 'visible'; 
            }, 300); 
        } else {
            chatTab.classList.add('collapsed');
            chatTab.style.overflow = 'hidden';
        }
    });
}

// IsEditor switch
{
    const editorSwitch = document.getElementById('editorSwitch');
    editorSwitch.addEventListener('change', function() {
        const isAdmin = (clientId == adminId)
        if (editorSwitch.checked) {
            const radios = document.querySelectorAll('input[name="clientToggle"]');
            radios.forEach(radio => radio.checked = false);
            handleClientToggle(clientId)

        }
        else if (isAdmin && !editorSwitch.checked) {
            editorSwitch.checked = true;
            console.log('Admin cannot uncheck this switch.');
        }
    });
}

// Admin Panel
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

    function stopResize() {
        document.documentElement.removeEventListener('mousemove', resizePanel);
        document.documentElement.removeEventListener('mouseup', stopResize);
    }
}

// Editor (Editor is Global)
{
    const editor_element = document.getElementById("editor")
    editor = CodeMirror.fromTextArea(editor_element, {
        mode: "python", 
        lineNumbers: true, 
        theme: "dracula", 
        tabSize: 4
    });
    editor.setOption("readOnly", true);

    editor.setValue('import time\nprint("Hello, World!")\nprint("Waiting...")\ntime.sleep(3)\nprint("Done!")');
    editor.setSize("100%","100%");
    editor.on("change", function(instance, changeObj) {
        console.log(changeObj)
        var code = instance.getValue();
        if (clientId && (changeObj.origin == "+input" || changeObj.origin == "+delete")) {
            console.log("Sending message")
            socket.send(JSON.stringify({ Code: code, ClientId: clientId, Action: "code" }));
        }
    });


}

// Editor Fullscreen
{
    document.getElementById('fullscreenButton').addEventListener('click', function () {
        const editorContainer = document.getElementById('editorContainer');
        const editor = document.getElementById('editor');
    
        if (!document.fullscreenElement) {
            // Enter fullscreen mode
            if (editorContainer.requestFullscreen) {
                editorContainer.requestFullscreen();
            } else if (editorContainer.webkitRequestFullscreen) { // for Safari
                editorContainer.webkitRequestFullscreen();
            } else if (editorContainer.msRequestFullscreen) { // for IE11
                editorContainer.msRequestFullscreen();
            }
    
            editor.classList.add('fullscreen');
            editorContainer.classList.add('fullscreen');
        } else {
            // Exit fullscreen mode
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { // for Safari
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { // for IE11
                document.msExitFullscreen();
            }
    
            editor.classList.remove('fullscreen');
            editorContainer.classList.remove('fullscreen');
        }
    });
}

// Editor Upload file
{
    const fileInput = document.getElementById('fileInput');
    const fileInputLabel = document.getElementById('fileInputLabel');
    const editor = document.getElementById('editor');

    // Handle file selection via input
    fileInput.addEventListener('change', handleFile);

    // Handle file drag and drop
    fileInputLabel.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileInputLabel.classList.add('dragging'); // Optional for drag styling
    });

    fileInputLabel.addEventListener('dragleave', () => {
        fileInputLabel.classList.remove('dragging'); // Optional for drag styling
    });

    fileInputLabel.addEventListener('drop', (e) => {
        e.preventDefault();
        fileInputLabel.classList.remove('dragging'); // Optional for drag styling
        const file = e.dataTransfer.files[0]; // Get the first file from the drop
        if (file) {
            readFile(file);
        }
    });

    // Function to handle file reading
    function handleFile(event) {
        const file = event.target.files[0]; // Get the selected file
        if (file) {
            readFile(file);
        }
    }

    // Function to read the file and display content in the editor
    function readFile(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            editor.value = e.target.result; // Set the file content in the textarea
        };
        reader.readAsText(file);
    }
}

// Custom context menu
{
    const customMenu = document.getElementById('customMenu');
    const editorContainer = editor.getWrapperElement();
    editorContainer.addEventListener('contextmenu', function(e) {
        e.preventDefault(); 
        customMenu.style.display = 'block';
        customMenu.style.left = `${e.pageX}px`;
        customMenu.style.top = `${e.pageY}px`;
    });
    
    document.addEventListener('mousedown', function(e) {
        setTimeout(function() {
            if (!customMenu.contains(e.target)) {
                customMenu.style.display = 'none';
            }
        }, 50); 
    });
    
    document.getElementById('menu1').addEventListener('click', async function() 
    {
        const selectedText = editor.getSelection(); 
        addMessageAiChatWindow(selectedText, AIchatMessages, "You", "#6666ff");
        let aiMessageElement = addMessageAiChatWindow("...", AIchatMessages, "AI Assistant", "#ff6666");
        console.log("Selected text", selectedText); 
        customMenu.style.display = 'none';
        addNewMessage('user', selectedText);
        sendNewMessage(aiMessageElement);
    });
}

// Run Button
{

    let outputElement = document.getElementById("output");
    document.getElementById("runButton").addEventListener("click", function() {
        runButton.disabled = true;
        var code = editor.getValue();
        let FirstRead = true;
        outputElement.textContent = "Processing...";

        // @NOTE So I tried XHR but... It works for Safari, but not for Chrome.. It looks like the problem is that Chrome
        // has a bigger buffer for the message and so the output dont feels smooth --Caio.
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

            function readStream() 
            {   
                return reader.read().then(({ done, value }) => 
                {
                    if (done) {return;}
                    if (FirstRead) {
                        outputElement.textContent = ""; 
                        FirstRead = false; 
                    }
                    let newElement = decoder.decode(value, { stream: true });
                    console.log("Streamed Response Part:", newElement);
                    outputElement.textContent += newElement;
                    return readStream();
                });
            }
            return readStream();
        })
        .then(() => runButton.disabled = false, console.log(outputElement.textContent))
        .catch(error => {
            document.getElementById("output").textContent = "Error: " + error.message;
        });
    });

    document.getElementById("sendPassword").addEventListener("click", function() {
    sendPassword(null)
    })
}

});
function sendPassword(password_input) {
    let pass = password_input || document.getElementById('adminPassword').value;
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
function showAdminNotification(text,Admin, Editor) {
    var adminMessageDiv = document.getElementById('adminMessage');
    adminMessageDiv.style.display = 'block'; 
    
    if (Admin) {
        adminMessageDiv.style.backgroundColor = '#e0ffe0'; 
        adminMessageDiv.style.borderColor = '#00b300';     
    }
    else {
        adminMessageDiv.style.backgroundColor = '#ee0000'; 
        adminMessageDiv.style.borderColor = '#ee0000';     
    }
    adminMessageDiv.innerHTML = `
    <button id="closeAdminMessage">X</button>
    <div class="messageText">${text}</div>`; 
    document.getElementById('closeAdminMessage').addEventListener('click', closeAdminMessage);
    setAdmin(Admin); 
    setEditor(Editor); 
    console.log(text);
}
function closeAdminMessage() {
    document.getElementById('adminMessage').style.display = 'none';
}
function setAdmin(Admin){
    let statusCircleAdmin = document.getElementById('adminStatus');
    if (Admin) {
        statusCircleAdmin.style.backgroundColor = 'green';
    } else {
        statusCircleAdmin.style.backgroundColor = 'red';
    }
}
function setEditor(Editor){
    let editorSwitch = document.getElementById('editorSwitch');

    if (Editor) {
        editorSwitch.checked = true;
        editor.setOption("readOnly", false);
    } else {
        editorSwitch.checked = false;
        editor.setOption("readOnly", true);
    }

}
function populateClients(clients,isAdmin) {
    console.log("Populating clients...")
    console.log("Admin is:",adminId)
    const clientsList = document.getElementById('clientsList');
    clientsList.innerHTML = ''; 
    const clientsList_ids = clients.split(",")
    clientsList_ids.forEach((client, index) => {
        if (client === adminId) {
            return;
        }
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
                console.log(event)
                if (event.target.checked) {
                    const editorSwitch = document.getElementById('editorSwitch');
                    editorSwitch.checked = false;
                    console.log("editorSwitch.checked", editorSwitch.checked)
                    handleClientToggle(event.target.value); 
                }
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
function initSocket(username) {
    socket = new WebSocket(`ws://localhost:8080/ws?clientId=${username}`);
    console.log(socket);
    socket.onopen = function() {
        console.log("Connected to WebSocket server");
    };
    socket.onmessage = function(event) 
    {
        let data = JSON.parse(event.data);
        
        console.log("Got message: ", data)
        
        if (data.Action == "authenticated")
        {   
            console.log("Authenticated", data.ClientId)
            if (data.ClientId == clientId) 
            {
                    showAdminNotification("You are now the admin and editor!", true,true); 
                    const editorSwitch = document.getElementById('editorSwitch');
                    editorSwitch.disabled = false;
            }
            adminId = data.ClientId
            const isAdmin = (adminId == clientId)
            populateClients(clients, isAdmin);
        }
        else if (data.Action == "failed")
        {
            socket.close();
            alert("This user name is in use or invalid");
        }
        else if (data.Action == "deauthenticated")
        {
            if (data.ClientId == clientId) 
            {
                showAdminNotification("You are not admin anymore", false,false); 
                const isAdmin = (adminId == clientId);
                populateClients(clients, isAdmin);
                const editorSwitch = document.getElementById('editorSwitch');
                editorSwitch.disabled = true;
            };
        }
        else if (data.Action == "hello") 
        {
            if (!clientId)
            {
                const modal = document.getElementById("usernameModal");
                modal.style.display = "none";
                clientId = data.ClientId;
                document.getElementById("username").textContent = clientId;
                console.log("Your id is", clientId);
                if (data.Password) 
                {
                    console.log("Your password is:", data.Password);
                    localStorage.setItem('adminPassword', data.Password);
                    document.getElementById('adminPassword').value = data.Password;
                    sendPassword(savedPassword);
                }
            }
        } 
        else if (data.Action == "sayhello")
        {
            adminId = data.AdminId;
            clients = (data.Clients === 0 || data.Clients === undefined) ? " " : data.Clients;
            const isAdmin = (adminId == clientId);
            populateClients(clients, isAdmin);
        }
        else if (data.Action == "byebye")
        {
            clients = (data.Clients === 0 || data.Clients === undefined) ? " " : data.Clients;
            const isAdmin = (adminId == clientId);
            populateClients(clients, isAdmin);
        }
        else if (data.Action == "transfer")
        {
        if (data.TransferId == clientId) {setEditor(true);}
            else {setEditor(false);}
        }
        else if (data.Action == "chat")
        {
            const msg = data.ChatMsg;
            const username = data.ClientId;
            const clientColor = getClientColor(username);
            const messageElement = document.createElement('p');
            messageElement.innerHTML = `<strong style="color: ${clientColor}">${username}:</strong> ${msg}`;
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        else if (data.Action == "code")
        {
            editor.setValue(data.Code);
            // editor.setCursor({line: 1, ch: 5})
        }
    };
    socket.onerror = function(error) {
        console.error("WebSocket error:", error);
    };
    socket.onclose = function() {
        console.log("WebSocket connection closed");
    };
}
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}
function getClientColor(clientId) {
    if (!clientColors[clientId]) {
        clientColors[clientId] = getRandomColor();
    }
    return clientColors[clientId];
}
function addMessageAiChatWindow(message, container, user, color) {
    const messageElement = document.createElement('p');
    messageElement.innerHTML = `<strong style="color: ${color}">${user}:</strong> ${message}`;
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
    return messageElement
}