let choiceResolver;

function confirmationWindow(text) {
    document.getElementById("modalconfirm-text").textContent = text;
    document.getElementById("confirm-modal").style.display = "flex";
    return new Promise((resolve) => {
        choiceResolver = resolve;  
    });
}

function resolveChoice(choice) {
    document.getElementById("confirm-modal").style.display = "none";
    choiceResolver(choice); 
}

export {confirmationWindow, resolveChoice}
