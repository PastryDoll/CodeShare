let fileConfigResolver;

function configurationWindow(text) {
    document.getElementById("fileconfiguration-text").textContent = text;
    document.getElementById("fileconfiguration-modal").style.display = "flex";
    return new Promise((resolve) => {
        fileConfigResolver = resolve;  
    });
}

function resolveConfigurationChoice(choice) {
    document.getElementById("fileconfiguration-modal").style.display = "none";
    fileConfigResolver(choice); 
}

export {configurationWindow, resolveConfigurationChoice}
