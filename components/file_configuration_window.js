let fileConfigResolver;

function configurationWindow(filename, fileformat) {
    document.getElementById("fname").value = filename;
    document.getElementById("fformat").value = fileformat;
    document.getElementById("fileconfiguration-modal").style.display = "flex";
    return new Promise((resolve) => {
        fileConfigResolver = resolve;  
    });
}

function resolveConfigurationChoice(choice) {
    document.getElementById("fileconfiguration-modal").style.display = "none";
    if (choice) {
        const response = {fileformat: document.getElementById("fformat").value, filename: document.getElementById("fname").value}
        fileConfigResolver(response); 
    }
    else {
        fileConfigResolver(false)
    }
}

export {configurationWindow, resolveConfigurationChoice}
