document.addEventListener("DOMContentLoaded", function() {
    var editor = CodeMirror.fromTextArea(document.getElementById("editor"), {
        mode: "python", 
        lineNumbers: true, 
        theme: "dracula", 
        tabSize: 4 
    });
    
    editor.setValue('print("Hello, Python World!")\n\n# Start coding here...');

    document.getElementById("runButton").addEventListener("click", function() {
        var code = editor.getValue();
        
        document.getElementById("output").textContent = "Processing...";
        fetch("/run", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ code: code })
        })
        .then(response => response.text())
        .then(output => {
            document.getElementById("output").textContent = output;
        })
        .catch(error => {
            document.getElementById("output").textContent = "Error: " + error;
        });
    });

});
