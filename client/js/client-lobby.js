const msgerForm = get(".msger-inputarea");
const msgerInput = get(".msger-input");
const msgerChat = get(".msger-chat");
const sock = io();
const playerList = document.getElementById("playerList");

sock.on('chat', (params) => {
    if (params.name !== PERSON_NAME) appendMessage(params.name, params.image, "left", params.message);
});
sock.on('chat-bot', (message) => {
   appendMessage(BOT_NAME, BOT_IMG, "left", message);
});
sock.on('chat-alert', appendAlert);
sock.on('set-image', (image) => PERSON_IMG = image);
sock.on('config-alert', (params) => {
   appendAlert(params.alert, 'build');
   switch (params.set) {
       case 'mode':
           document.getElementById('modeTitle').innerText = params.mode;
           document.getElementById('modeDesc').innerHTML = params.message;
           break;
       case 'size':
           document.getElementById('boardSize').innerHTML = params.size;
           break;
       case 'team':
           const display = params.ffa ? 'none' : 'inherit';
           document.getElementById('teamTitle').innerText = params.title;
           document.getElementById('teamModeDesc').innerHTML = params.message;
           document.getElementById('teamSelect').style.setProperty('display', display);
           refreshPlayerList(params.players);
           break;
       case 'theme':
           let chipHandler = M.Chips.getInstance(document.querySelector('.chips'));
           const onAdd = chipHandler.options.onChipAdd;
           const onDelete = chipHandler.options.onChipDelete;
           chipHandler.options.onChipAdd = null;
           chipHandler.options.onChipDelete = null;
           for (let i = chipHandler.chipsData.length - 1; i >= 0; i--) {
               chipHandler.deleteChip(i);
           }
           for (let theme of params.themes) {
               let data = {tag: theme};
               chipHandler.addChip(data);
           }
           chipHandler.options.onChipAdd = onAdd;
           chipHandler.options.onChipDelete = onDelete;
           break;
   }

});
sock.on('connect-alert', (params) => {
    appendAlert(params.alert);
    refreshPlayerList(params.players);
});
sock.on('request-connect', () => {
    sock.emit('lobby-connect', {name: PERSON_NAME, password: LOBBY_CODE});
});
sock.on('update-lobbylist', (players) => {
    refreshPlayerList(players);
});
sock.on('dc', () => {
    window.alert('Lost connection to lobby. Returning to the home screen.');
    location.replace('./');
});
sock.on('goto-game', (gameId) => {
    console.log(`Starting game: ${gameId}`);
    let url = './game';
    let form = document.createElement('form');
    form.setAttribute('action', url);
    form.setAttribute('method', 'post');
    form.style.setProperty('display','none');
    let input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('name', 'gameId');
    input.setAttribute('value', gameId);
    form.insertBefore(input, null);
    let input2 = document.createElement('input');
    input2.setAttribute('type', 'text');
    input2.setAttribute('name', 'name');
    input2.setAttribute('value', PERSON_NAME);
    form.insertBefore(input2, null);
    document.body.insertBefore(form, null);
    sessionStorage.setItem('recallYorubaName',PERSON_NAME.toString());
    sessionStorage.setItem('recallYorubaId',gameId.toString());
    form.submit();
});
const BOT_MSGS = [
"Hi, how are you?",
"Ohh... I can't understand what you trying to say. Sorry!",
"I like to play games... But I don't know how to play!",
"Sorry if my answers are not relevant. :))",
"I feel sleepy! :("];


// Icons made by Freepik from www.flaticon.com
const BOT_IMG = "https://image.flaticon.com/icons/svg/327/327779.svg";
const BOT_NAME = "Coach Bot";
const PERSON_NAME = document.querySelector("#identifier").innerText;
const LOBBY_CODE = document.querySelector("#password").innerText;
let PERSON_IMG = document.querySelector("#playerImage").innerText;

msgerForm.addEventListener("submit", event => {
  event.preventDefault();

  const msgText = msgerInput.value;
  if (!msgText) return;

  appendMessage(PERSON_NAME, PERSON_IMG, "right", msgText);
  msgerInput.value = "";

  sock.emit('chat', {name: PERSON_NAME, message: msgText});
  if (msgText.toLowerCase().includes('coach')) {
      sock.emit('chat-bot', PERSON_NAME);
  }
});

function appendAlert(text, icon = 'info') {
    const msgHTML = `
        <div class="msg">
            <div class="msg-bubble msg-alert msg-info">
                ${text} <i class="small material-icons">${icon}</i>
            </div>
        </div>
        `;
    msgerChat.insertAdjacentHTML("beforeend", msgHTML);
    msgerChat.scrollTop += 100;
}

function appendMessage(name, img, side, text) {
  //   Simple solution for small apps
  const msgHTML = `
    <div class="msg ${side}-msg">
      <div class="msg-img" style="background-image: url(../img/${img})"></div>

      <div class="msg-bubble">
        <div class="msg-info">
          <div class="msg-info-name">${name}</div>
          <div class="msg-info-time">${formatDate(new Date())}</div>
        </div>

        <div class="msg-text">${text}</div>
      </div>
    </div>
  `;

  msgerChat.insertAdjacentHTML("beforeend", msgHTML);
  msgerChat.scrollTop += 500;
}

function botResponse() {
  const r = random(0, BOT_MSGS.length - 1);
  const msgText = BOT_MSGS[r];
  const delay = msgText.split(" ").length * 100;

  setTimeout(() => {
    appendMessage(BOT_NAME, BOT_IMG, "left", msgText);
  }, delay);
}

// Utils
function get(selector, root = document) {
  return root.querySelector(selector);
}

function formatDate(date) {
  const h = "0" + date.getHours();
  const m = "0" + date.getMinutes();

  return `${h.slice(-2)}:${m.slice(-2)}`;
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function refreshPlayerList(lobbyList) {
    playerList.innerHTML = "";
    for (let player in lobbyList) {
        const color = lobbyList[player];
        let a = document.createElement("a");
        let span = document.createElement("span");
        a.className = 'collection-item modal-trigger';
        a.innerText = player;
        if (player === PERSON_NAME) {
            a.onclick = setProfilePic;
        }
        span.className = 'new badge ' + color[1];
        span.setAttribute('data-badge-caption', 'Team');
        span.innerText = color[0];
        a.insertBefore(span, null);
        playerList.insertBefore(a, null);
    }
}

function setImage(image) {
    sock.emit('set-image', image);
    let profileModal = document.getElementById("profilePicModal");
    let instance = M.Modal.getInstance(profileModal);
    instance.close();
}

function setProfilePic() {
    let profileModal = document.getElementById("profilePicModal");
    let instance = M.Modal.getInstance(profileModal);
    instance.open();
}

// Settings
document.addEventListener('DOMContentLoaded', function() {
    let elems = document.querySelectorAll('.lobby_config');
    elems.forEach(elem => {
        let params = elem.id.split('_');
        elem.onclick = function() {
            sock.emit('lobby-config', params);
        }
    });
});
