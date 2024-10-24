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
const editorSwitch = document.getElementById('editorButton');
const outputElement = document.getElementById("output");

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
}

// IsEditor switch
{
    editorSwitch.addEventListener('click', function() {
        const isAdmin = (clientId == adminId)
        
        if (editorSwitch.classList.contains('deactivated'))
        {
            toggleEditorStatus(true);
            const radios = document.querySelectorAll('input[name="clientToggle"]');
            radios.forEach(radio => radio.checked = false);
            handleClientToggle(clientId)
        }
        else if (isAdmin && editorSwitch.classList.contains('active'))
        {
            console.log('Admin cannot uncheck this switch.');

        }
    });
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

// Clients List
{
    document.getElementById("clientDropdownButton").addEventListener("click", function () {
        const dropdown = document.getElementById("clientDropdown");
        dropdown.classList.toggle("show");
    
        if (dropdown.classList.contains("show")) {
            dropdown.style.display = "block"; // Ensure it's visible
        } else {
            setTimeout(() => {
                dropdown.style.display = "none"; // Delay hiding to allow animation
            }, 300); // This should match the transition duration (0.3s)
        }
    });
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
        const fullscreenIcon = document.getElementById('fullscreenIcon');
        const minimizeIcon = document.getElementById('minimizeIcon');
    
        if (!document.fullscreenElement) {
            // Enter fullscreen mode
            if (editorContainer.requestFullscreen) {
                editorContainer.requestFullscreen()
            } else if (editorContainer.webkitRequestFullscreen) { // for Safari
                editorContainer.webkitRequestFullscreen()
            } else if (editorContainer.msRequestFullscreen) { // for IE11
                editorContainer.msRequestFullscreen()
            }
            fullscreenIcon.classList.remove('show');
            minimizeIcon.classList.add('show');
            editor.classList.add('fullscreen');
            editorContainer.classList.add('fullscreen');
        } else {
            // Exit fullscreen mode
            if (document.exitFullscreen) {
                document.exitFullscreen()
            } else if (document.webkitExitFullscreen) { // for Safari
                document.webkitExitFullscreen()
            } else if (document.msExitFullscreen) { // for IE11
                document.msExitFullscreen();
            }
            
            fullscreenIcon.classList.add('show');
            minimizeIcon.classList.remove('show');
            editor.classList.remove('fullscreen');
            editorContainer.classList.remove('fullscreen');
        }
    });
}

// Download Editor 
{

    const mode2ext = {
        'python': 'py',
        'golang': 'go',
        'javascript': 'js'
    };

    document.getElementById('exportButton').addEventListener('click', () => {
        const code = editor.getValue(); 
        const blob = new Blob([code], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        console.log(editor)
        link.download = `code.${mode2ext[editor.options.mode]}`;
        link.click();
    });
}

// Upload to Editor
{
    const ext2mode = {
        'py': 'python',
        'js': 'javascript',
        'go': 'golang'
    }

    document.getElementById('importButton').addEventListener('click', () => 
    {
        document.getElementById('fileInput').click();
    });
    document.getElementById('fileInput').addEventListener('change', (event) => 
    {
        const file = event.target.files[0];
        if (file) 
        {
            const reader = new FileReader();
            reader.onload = function(e) 
            {
                const fileContent = e.target.result;
                const filename = file.name;
                const extension = filename.split('.').pop().toLowerCase();
                const mode = ext2mode[extension] || 'plaintext';
                console.log("Uploading file:", filename, "of type:", mode);
                editor.setOption('mode', mode);
                editor.setValue(fileContent);
                console.log("editor:", editor);
            };
            reader.readAsText(file);
        }
    });
}

// Custom context menu
{
    const customMenu = document.getElementById('customMenu');
    const editorContainer = editor.getWrapperElement();
    editorContainer.addEventListener('contextmenu', function(e) {
        e.preventDefault(); 
        console.log("hi")
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
            outputElement.textContent = "Error: " + error.message;
        });
    });

    document.getElementById("sendPassword").addEventListener("click", function() {
    sendPassword(null)
    })
}

// Output tabs
{
    const resizer = document.getElementById('resizer-up');
    const tabsandcontentElement = document.getElementById('tabsandcontent');
    let initialMouseY;
    
    resizer.addEventListener('mousedown', function (e) {
        e.preventDefault();
        
        initialMouseY = e.clientY;
        window.addEventListener('mousemove', resizeHeight);
        window.addEventListener('mouseup', stopResize);
    });
    
    function resizeHeight(e) {
        const mouseDeltaY = e.clientY - initialMouseY;
        const newHeight = tabsandcontentElement.getBoundingClientRect().height - mouseDeltaY;
        console.log(tabsandcontentElement.getBoundingClientRect().height)
        if (newHeight > 140) {
            tabsandcontentElement.style.height = newHeight + 'px';
        }
        initialMouseY = e.clientY;
    }
    
    function stopResize() {
        window.removeEventListener('mousemove', resizeHeight);
    }

    function openTab(evt, tabName) {
        const tabcontent = document.getElementsByClassName("tabcontent");
        for (let i = 0; i < tabcontent.length; i++) {
            tabcontent[i].style.display = "none";
        }
        const tablinks = document.getElementsByClassName("tablinks");
        for (let i = 0; i < tablinks.length; i++) {
            tablinks[i].className = tablinks[i].className.replace(" active", "");
        }
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.className += " active";
    }
    window.openTab = openTab;
    document.querySelector(".tablinks").click();

    function downloadTabContent() {
        const activeTab = document.querySelector(".tabcontent[style*='block']");
        let content = "";
    
        if (activeTab) {
            const logContent = activeTab.querySelector(".tab-text-content");
            if (logContent) {
                content = logContent.innerText;  
            }
            const blob = new Blob([content], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
    
            const a = document.createElement('a');
            a.href = url;
            a.download = `${activeTab.id}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }
    document.getElementById("download-tab-content").addEventListener("click", downloadTabContent);
}

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
    if (Editor) {
        toggleEditorStatus(true);
        editor.setOption("readOnly", false);
    } else {
        toggleEditorStatus(false);
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
                    toggleEditorStatus(false);
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
function toggleEditorStatus(checked)
{   
    console.log("Before",editorSwitch.classList);
    if (checked)
    {
        console.assert(editorSwitch.classList.contains("deactivated"))
        editorSwitch.classList.remove('deactivated'); 
        editorSwitch.classList.add('active');
    }
    else 
    {
        console.assert(editorSwitch.classList.contains("active"))
        editorSwitch.classList.remove('active'); 
        editorSwitch.classList.add('deactivated');
    }
    console.log("After:", editorSwitch.classList);

}
});