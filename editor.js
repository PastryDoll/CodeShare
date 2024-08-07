document.addEventListener("DOMContentLoaded", function() {
    var editor = CodeMirror.fromTextArea(document.getElementById("editor"), {
        mode: "python", 
        lineNumbers: true, 
        theme: "dracula", 
        tabSize: 4 
    });
    
    editor.setValue('import time\nprint("Hello, World!")\nprint("Waiting...")\ntime.sleep(3)\nprint("Done!")');

    document.getElementById("runButton").addEventListener("click", function() {
        var code = editor.getValue();

        var outputElement = document.getElementById("output");
        outputElement.textContent = "Processing...";
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/run", true);
        xhr.setRequestHeader("Content-Type", "application/json");
        
        let lastProcessedIndex = 0;
        xhr.onreadystatechange = function() {
            if (xhr.readyState >= XMLHttpRequest.LOADING) {
                const newOutput = xhr.responseText.substring(lastProcessedIndex);
                if (lastProcessedIndex === 0) {
                    outputElement.textContent = newOutput;
                } else {
                    outputElement.textContent += newOutput;
                }
                lastProcessedIndex = xhr.responseText.length;
            }
        };

        xhr.onload = function() {
            if (xhr.status === 200) {
            } else {
                document.getElementById("output").textContent += "Error: " + xhr.statusText;
            }
        };

        xhr.send(JSON.stringify({ code: code }));
    });

});