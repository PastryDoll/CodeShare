document.addEventListener("DOMContentLoaded", function() 
{
// 
//// Set default code editor theme and params.
// 
    var editor = CodeMirror.fromTextArea(document.getElementById("editor"), {
        mode: "python", 
        lineNumbers: true, 
        theme: "dracula", 
        tabSize: 4 
    });

    editor.setValue('import time\nprint("Hello, World!")\nprint("Waiting...")\ntime.sleep(3)\nprint("Done!")');

// 
//// Effect of pressing the run code button. This should send the code to the server and. receive the 
//   output stream and update the output window. 

    document.getElementById("runButton").addEventListener("click", function() {
        runButton.disabled = true;
        var code = editor.getValue();
        var outputElement = document.getElementById("output");
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
        .then(runButton.disabled = false)
        .catch(error => {
            document.getElementById("output").textContent = "Error: " + error.message;
        });
    });
});