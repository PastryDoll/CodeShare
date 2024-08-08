document.addEventListener("DOMContentLoaded", function() {
    var editor = CodeMirror.fromTextArea(document.getElementById("editor"), {
        mode: "python", 
        lineNumbers: true, 
        theme: "dracula", 
        tabSize: 4 
    });
    
    editor.setValue('import time\nprint("Hello, World!")\nprint("Waiting...")\ntime.sleep(3)\nprint("Done!")');
    document.getElementById("runButton").addEventListener("click", function() {
        runButton.disabled = true;
        var code = editor.getValue();
        var outputElement = document.getElementById("output");
        outputElement.textContent = "Processing...";

        //So I tried XHR but... It works for Safari, but not for Chrome.. It looks like the problem is that Chrome
        // has a bigger buffer for the message and so the output dont feels smooth.
        let FirstRead = true;
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
    // var outputElement = document.getElementById("output");
    // outputElement.style.color = "#888"; 
    // outputElement.style.fontWeight = "bold"; 
    // outputElement.textContent = "Output Window:";
});