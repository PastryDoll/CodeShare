import { sendNewMessage, addNewMessage } from './components/ai_assistant_history.js';
import { resolveChoice, confirmationWindow } from './components/confirmation_window.js';

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
let activeButton = null;

document.addEventListener("DOMContentLoaded", function() 
{

window.resolveChoice = resolveChoice;
// Init hot DOM elements
const AIchatMessages = document.getElementById('messages-ai');
const chatMessages = document.getElementById('messages');
const editorSwitch = document.getElementById('editorButton');
const outputElement = document.getElementById("output");
const raiseHandButton = document.getElementById("raisehandButton");

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
            const doc = editor.getDoc();
            const from = data.Changes.from;  
            const to = data.Changes.to;      
            const text = data.Changes.text;  
            doc.replaceRange(text.join("\n"), from, to);
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

// Editor (Editor is Global)
{
    const editor_element = document.getElementById("editor")
    editor = CodeMirror.fromTextArea(editor_element, {
        mode: "python", 
        lineNumbers: true, 
        theme: "dracula", 
        tabSize: 4
    });
    editor.getWrapperElement().style.fontSize = `18px`;
    editor.setOption("readOnly", true);
    // editor.setValue('import time\nprint("Hello, World!")\nprint("Waiting...")\ntime.sleep(3)\nprint("Done!")');
    editor.setValue('');
    editor.setSize("100%","100%");
    editor.on("change", function(instance, changeObj) {
        console.log(changeObj)
        var code = instance.getValue();
        if (clientId && (changeObj.origin == "+input" || changeObj.origin == "+delete" || changeObj.origin == "paste")) {
            console.log("Sending message")
            const changeData = {
                from: changeObj.from,          // Start position of change
                to: changeObj.to,              // End position of change
                text: changeObj.text,          // Text inserted (empty if deleted)
                origin: changeObj.origin,      // Origin of change (+input or +delete)
            };
            const messageData = {

                Changes: changeData,
                Action: "code",
                ClientId: clientId
            }
                
            socket.send(JSON.stringify(messageData));
        }
    });
}

// Editor font size
{
    const fontSizes = Array.from({ length: (32 - 8) / 2 + 1 }, (_, i) => 8 + i * 2);
    const fontList = document.getElementById('fontList');
    const dropdown = document.getElementById("fontDropdown");
    
    fontSizes.forEach(size => {
        const listItem = document.createElement('li');
        listItem.textContent = size;
        listItem.onclick = () => {
            editor.getWrapperElement().style.fontSize = `${size}px`;
            dropdown.classList.toggle("show");
            dropdown.style.display = 'none'; 
        };
        fontList.appendChild(listItem);
    });

    document.getElementById("fontSize").addEventListener("click", function () {
        dropdown.classList.toggle("show");
    
        if (dropdown.classList.contains("show")) {
            dropdown.style.display = "block"; 
        } else {
            setTimeout(() => {
                dropdown.style.display = "none"; 
            }, 300); 
        }
    });

    document.addEventListener('click', (event) => {
        if (!document.getElementById('fontSize').contains(event.target) &&
            !fontList.contains(event.target)) {
            dropdown.classList.toggle("show");
            dropdown.style.display = 'none'; 
        }
    });
}

// New Blank Project
{
    document.getElementById('blankPage').addEventListener('click', async () => 
    {
        const response = await confirmationWindow("This will delete you current project. Are you sure you want to proceed?");
        if (response) {editor.setValue("")};
    });
}

// Editor Upload Content
{
    const ext2mode = {
        'py': 'python',
        'js': 'javascript',
        'go': 'go'
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

// Editor Download Content 
{

    const mode2ext = {
        'python': 'py',
        'go': 'go',
        'javascript': 'js'
    };

    document.getElementById('exportButton').addEventListener('click', async () => {
        const code = editor.getValue(); 
        const blob = new Blob([code], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        console.log(editor)
        link.download = `code.${mode2ext[editor.options.mode]}`;
        link.click();
    });
}

// Editor Editing Mode button
{
    editorSwitch.addEventListener('click', function() {
        const isAdmin = (clientId == adminId);
        
        if (editorSwitch.classList.contains('deactivated')) {
            toggleButton(editorSwitch, true, 'active', 'deactivated'); 
    
            const clientButtons = document.querySelectorAll('.editorButtonList');
            clientButtons.forEach(button => {
                button.classList.remove('active');
                button.classList.add('inactive');
            });
    
            handleClientToggle(clientId);
        } 
        else if (isAdmin && editorSwitch.classList.contains('active')) {
            console.log('Admin cannot uncheck this switch.');
        }
    });
}

// Editor Raise Hand Button
{
    raiseHandButton.addEventListener('click', function() {
        if (raiseHandButton.classList.contains('deactivated')) {
            toggleButton(raiseHandButton, true, 'active', 'deactivated'); 
            showPopup();
        } 
        else {
            toggleButton(raiseHandButton, false, 'active', 'deactivated'); 
        }
    })
}

// Editor Fullscreen
{
    document.getElementById('fullscreenButton').addEventListener('click', function () {
        const editorContainer = document.getElementById('editorContainer');
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
            editorContainer.classList.remove('fullscreen');
        }
    });
}

// Client List
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

    const dropdown = document.getElementById("clientDropdown");
    document.getElementById("clientDropdownButton").addEventListener("click", function () {
        dropdown.classList.toggle("show");
    
        if (dropdown.classList.contains("show")) {
            dropdown.style.display = "block"; 
        } else {
            setTimeout(() => {
                dropdown.style.display = "none"; 
            }, 300); 
        }
    });

    document.addEventListener('click', (event) => {
        if (!document.getElementById('clientDropdownButton').contains(event.target) &&
            !fontList.contains(event.target)) {
            dropdown.classList.toggle("show");
            dropdown.style.display = 'none'; 
        }
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
    document.querySelectorAll(".tablinks")[2].click(); // Initialize as output tab
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
        toggleButton(editorSwitch, true, 'active', 'deactivated');
        editor.setOption("readOnly", false);
    } else {
        toggleButton(editorSwitch, false, 'active', 'deactivated');
        editor.setOption("readOnly", true);
    }
}
function populateClients(clients, isAdmin) {
    console.log("Populating clients...");
    console.log("Admin is:", adminId);
    const clientsList = document.getElementById('clientsList');
    clientsList.innerHTML = ''; 
    const clientsList_ids = clients.split(",");
    
    clientsList_ids.forEach((client, index) => {
        if (client === adminId) {
            return;
        }
        
        const li = document.createElement('li');
        const label = document.createElement('label');
        label.innerText = client;
        
        if (isAdmin) {
            const editorButton = document.createElement('button');
            editorButton.type = 'button';
            editorButton.id = `client-${index}`;
            editorButton.classList.add('editorButtonList', 'inactive'); 

            editorButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-vector-pen" viewBox="0 0 16 16">
                    <path fill-rule="evenodd" d="M10.646.646a.5.5 0 0 1 .708 0l4 4a.5.5 0 0 1 0 .708l-1.902 1.902-.829 3.313a1.5 1.5 0 0 1-1.024 1.073L1.254 14.746 4.358 4.4A1.5 1.5 0 0 1 5.43 3.377l3.313-.828zm-1.8 2.908-3.173.793a.5.5 0 0 0-.358.342l-2.57 8.565 8.567-2.57a.5.5 0 0 0 .34-.357l.794-3.174-3.6-3.6z"/>
                    <path fill-rule="evenodd" d="M2.832 13.228 8 9a1 1 0 1 0-1-1l-4.228 5.168-.026.086z"/>
                </svg>
            `;

            editorButton.addEventListener('click', () => {
                if (activeButton && activeButton !== editorButton) {
                    activeButton.classList.remove('active');
                    activeButton.classList.add('inactive');
                }
                editorButton.classList.add('active');
                editorButton.classList.remove('inactive');
                activeButton = editorButton;

                toggleButton(editorSwitch, false, 'active', 'deactivated'); 
                handleClientToggle(client);
            });

            const raisehandButton = document.createElement('button');
            raisehandButton.type = 'button';
            raisehandButton.id = `raisehand-${index}`;
            raisehandButton.classList.add('raiseHandButton'); 
            raisehandButton.title = "Raise your hand";
            raisehandButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 3 50 50">
                <path d="M 25.1289 53.5117 C 33.3789 53.5117 39.1680 49.0352 42.2851 40.2461 L 46.4102 28.6445 C 47.4414 25.7149 46.5039 23.3008 44.0664 22.4102 C 41.8867 21.6133 39.7305 22.5508 38.6992 24.9649 L 37.1758 28.7149 C 37.1289 28.8086 37.0586 28.8789 36.9649 28.8789 C 36.8476 28.8789 36.8008 28.7852 36.8008 28.6680 L 36.8008 9.8711 C 36.8008 7.1289 35.0898 5.4180 32.4649 5.4180 C 31.5039 5.4180 30.6367 5.7461 29.9805 6.3555 C 29.6758 3.9649 28.1289 2.4883 25.8086 2.4883 C 23.5351 2.4883 21.9414 4.0117 21.5898 6.3086 C 21.0039 5.7227 20.1602 5.4180 19.3164 5.4180 C 16.8789 5.4180 15.2617 7.1055 15.2617 9.7071 L 15.2617 12.3086 C 14.6289 11.6524 13.6914 11.3008 12.6836 11.3008 C 10.2461 11.3008 8.5586 13.1055 8.5586 15.7305 L 8.5586 35.8633 C 8.5586 46.8320 15.2149 53.5117 25.1289 53.5117 Z M 25.0117 50.2539 C 16.7149 50.2539 11.6524 44.9336 11.6524 35.4883 L 11.6524 16.0586 C 11.6524 15.0742 12.2851 14.3711 13.2695 14.3711 C 14.2305 14.3711 14.9336 15.0742 14.9336 16.0586 L 14.9336 28.0352 C 14.9336 28.9024 15.6367 29.4883 16.3867 29.4883 C 17.1836 29.4883 17.9102 28.9024 17.9102 28.0352 L 17.9102 10.1289 C 17.9102 9.1211 18.5430 8.4414 19.5039 8.4414 C 20.4883 8.4414 21.1680 9.1211 21.1680 10.1289 L 21.1680 26.8398 C 21.1680 27.7071 21.8711 28.2930 22.6445 28.2930 C 23.4414 28.2930 24.1680 27.7071 24.1680 26.8398 L 24.1680 7.2227 C 24.1680 6.2383 24.8242 5.5117 25.8086 5.5117 C 26.7461 5.5117 27.4258 6.2383 27.4258 7.2227 L 27.4258 26.8398 C 27.4258 27.6602 28.0820 28.2930 28.9024 28.2930 C 29.6992 28.2930 30.4024 27.6602 30.4024 26.8398 L 30.4024 10.1289 C 30.4024 9.1211 31.0820 8.4414 32.0430 8.4414 C 33.0273 8.4414 33.6836 9.1211 33.6836 10.1289 L 33.6836 33.1914 C 33.6836 34.2695 34.3633 35.0430 35.3476 35.0430 C 36.1914 35.0430 36.8945 34.6680 37.4336 33.4961 L 40.6211 26.3711 C 41.0430 25.3633 41.8867 24.8476 42.7539 25.1758 C 43.6914 25.5508 44.0195 26.4414 43.5742 27.6602 L 39.4258 39.2383 C 36.5664 47.2305 31.5508 50.2539 25.0117 50.2539 Z"/>
            </svg>
            `;

            li.appendChild(editorButton);
            li.appendChild(raisehandButton);
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
function toggleButton(buttonElement,checked, activatedClass, deactivatedClass)
{   
    if (checked)
    {
        console.assert(buttonElement.classList.contains(deactivatedClass))
        buttonElement.classList.remove(deactivatedClass); 
        buttonElement.classList.add(activatedClass);
    }
    else 
    {
        console.assert(buttonElement.classList.contains(activatedClass))
        buttonElement.classList.remove(activatedClass); 
        buttonElement.classList.add(deactivatedClass);
    }

}
function showPopup() {
    const popup = document.getElementById('popup');
    popup.classList.add('show');
    popup.classList.remove('hide');
  
    setTimeout(() => {
      popup.classList.remove('show');
      popup.classList.add('hide');
    }, 2000);
  }
});