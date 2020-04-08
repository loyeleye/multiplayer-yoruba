let wsocket = new sockjs.SockJSConnection('/chat');
let client = Stomp.over(wsocket);
client.connect({}, function(frame) {
    client.subscribe('/topic/messages', function (message) {
        addEvent(JSON.parse(message.body));
    });
});

function send(name, message, topic) {
    client.send("/app/chat/" + topic, {}, JSON.stringify({
        from: name,
        text: message,
    }));
}

function addEvent(message) {
    const events = document.getElementById("events");
    let li = document.createElement("li");
    li.innerText = message;
    events.appendChild(li);
}

function chat() {
    let chat = document.getElementById("chat");
    let msg = chat.innerText;
    let player = "Player 1";
    send(player, msg, "lobby");
}