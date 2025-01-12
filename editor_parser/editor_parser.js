const fs = require("fs");
const { EditorState } = require("@codemirror/state");

const DOCUMENT_PATH = "data/document.txt";

function loadDocument(filename) {
  try {
    if (fs.existsSync(filename)) {
      return fs.readFileSync(filename, "utf8");
    } else {
      fs.writeFileSync(filename, "", "utf8");
      return "";
    }
  } catch (error) {
    console.error(`Error loading document: ${error.message}`);
    return "";
  }
}

function applyChanges(changes, state) {
  console.log("Original Text:", state.doc.toString());

  const from = changes.from;
  const to = changes.to;
  const text = changes.text.join("\n");
  const fromOffset = state.doc.line(from.line + 1).from + from.ch;
  const toOffset = state.doc.line(to.line + 1).from + to.ch;

  const newDoc = state.update({
    changes: { from: fromOffset, to: toOffset, insert: text },
  }).state.doc;

  console.log("Modified Text:", newDoc.toString());

  return newDoc.toString();
}

function saveToFile(filename, content) {
  fs.writeFileSync(filename, content, "utf8");
  console.log(`Document saved to ${filename}`);
}

process.stdin.on("data", (data) => {
  try {
    const changes = JSON.parse(data.toString());
    const currentText = loadDocument(DOCUMENT_PATH);
    const state = EditorState.create({
      doc: currentText,
    });
    const updatedDoc = applyChanges(changes, state);
    saveToFile(DOCUMENT_PATH, updatedDoc);
    process.stdout.write(updatedDoc);
  } catch (error) {
    process.stderr.write(`Error: ${error.message}`);
  }
});
