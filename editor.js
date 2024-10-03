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
    console.log(editor);

    var socket = new WebSocket("ws://localhost:8080/ws");
    var clientID = null;
    var savedPassword = localStorage.getItem('adminPassword');
    console.log("Your saved password is:", savedPassword);

    socket.onmessage = function(event) 
    {
        var data = JSON.parse(event.data);
        console.log("Got message: ", data)
        
        if (data.Action == "authenticated")
        {
            showAdminNotification("You are now the admin and editor!", true,true);
        }
        else if (data.Action == "deauthenticated")
        {
            showAdminNotification("You are not admin anymore", false,false);
        }
        else if (data.Action == "hello") 
        {
            clientID = data.ClientId;
            console.log("Your id is", clientID);
            if (data.Password) 
            {
                console.log("You are the admin. Your password is:", data.Password);
                localStorage.setItem('adminPassword', data.Password);
                document.getElementById('adminPassword').value = data.Password;
            }
            if (savedPassword) 
            {
                sendPassword(savedPassword, clientID, socket);
            }

        } 
        else 
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
        if (clientID && (changeObj.origin == "+input" || changeObj.origin == "+delete")) {
            console.log("Sending message")
            socket.send(JSON.stringify({ code: code, client_id: clientID }));
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
    sendPassword(null, clientID, socket)
    })
});

function sendPassword(password,clientID, socket) {
    var pass = password || document.getElementById('adminPassword').value;
    
    if (pass && socket) {
        socket.send(JSON.stringify({
            client_id: clientID,
            action: "authenticate",
            password: pass
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
    updateStatus(isAdmin, isEditor); 
    console.log(text);
}

function updateStatus(isAdmin, isEditor) {
    var statusCircleAdmin = document.getElementById('adminStatus');
    var statusCircleEditor = document.getElementById('editorStatus');

    if (isAdmin) {
        statusCircleAdmin.style.backgroundColor = 'green';
    } else {
        statusCircleAdmin.style.backgroundColor = 'red';
    }
    if (isEditor) {
        statusCircleEditor.style.backgroundColor = 'green';
    } else {
        statusCircleEditor.style.backgroundColor = 'red';
    }
}