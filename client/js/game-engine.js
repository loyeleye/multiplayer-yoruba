const msgerForm = get(".msger-inputarea");
const msgerInput = get(".msger-input");
const msgerChat = get(".msger-chat");

const sock = io();
const scoreList = get("#scores");
const turnsList = get("#turns");
const teamsList = get("#teams");

const turnHeader = get("#playerTurnHeader");
const turnModal = get("#turnModal");

const BOT_IMG = "https://image.flaticon.com/icons/svg/327/327779.svg";
const PERSON_IMG = "https://image.flaticon.com/icons/svg/145/145867.svg";
const BOT_NAME = "Coach Bot";
const PERSON_NAME = document.querySelector("#identifier").innerText;

const BOT_PHRASES = ['"{0}"? I believe that is "{1}" in English.',
                        'Ah, "{0}"... Or as the Oyinbos might say: "{1}".',
                        '"{0}" in Yorùbá means "{1}".'];

// GRID
let grid = null;
let board = null;
let fitScreen = true;
let actionInProgress = false;
const flip_front = "dw-flp__pnl dw-flp__pnl--frnt tx--white bd--white tx--center bg--dkgreen";
const flip_back = "dw-flp__pnl dw-flp__pnl--bck bd--white tx--white tx--center bg--black";


sock.on('chat', (params) => {
    if (params.name !== PERSON_NAME) appendMessage(params.name, PERSON_IMG, "left", params.message);
});
sock.on('chat-alert', appendAlert);
sock.on('dc', () => {
    window.alert('Lost connection to game. Returning to the home screen.');
    location.replace('./');
});
sock.on('request-connect', () => {
    sock.emit('game-connect', {
        'id': sessionStorage.getItem('recallYorubaId'),
        'name': sessionStorage.getItem('recallYorubaName')
    });
});
sock.on('connect-alert', (params) => {
    appendAlert(params.alert);
    refreshLists(params.players);
});

sock.on('response-flip', flipCard);
sock.on('refresh-list', refreshLists);
sock.on('response-unflip', unflip);
sock.on('response-match', match);
sock.on('next-turn', nextTurn);
sock.on('response-win', showWin);
sock.on('refresh-grid', refreshGrid);
sock.on('toast-alert', (params) => toastAlert(params.text, params.classes));

get("#confirmQuitBtn").addEventListener('click', quitGame);

msgerForm.addEventListener("submit", event => {
    event.preventDefault();

    const msgText = msgerInput.value;
    if (!msgText) return;

    appendMessage(PERSON_NAME, PERSON_IMG, "right", msgText);
    msgerInput.value = "";

    sock.emit('chat', {name: PERSON_NAME, message: msgText});
});

function appendMessage(name, img, side, text) {
    //   Simple solution for small apps
    const msgHTML = `
    <div class="msg ${side}-msg">
      <div class="msg-img" style="background-image: url(${img})"></div>

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

function toastAlert(text, classes = 'rounded') {
    M.toast({html: text, classes: classes});
}

function appendAlert(text, icon = 'info') {
    if (typeof(text) === 'undefined') return;
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

async function refreshLists(params) {
    try {
        refreshScoreList(params.scorelist);
        refreshTurnsList(params.turnslist);
        refreshTeamsList(params.teamslist);
    } catch (err) {
        console.log('Refresh failed. Re-requesting...');
        await sleep(500);
        sock.emit('request-refresh');
    }

}

function refreshScoreList(scores) {
    scoreList.innerHTML = "";
    for (let score of scores) {
        let li = document.createElement('li');
        li.innerHTML = `<a><i class="material-icons ${score.textColor}">star</i> <pre>${score.score} pts\t${score.player}</pre></a>`;
        scoreList.insertBefore(li, null);
    }
}

function refreshTurnsList(turns) {
    turnsList.innerHTML = "";
    for (let turn of turns) {
        let li = document.createElement('li');
        let icon, color, name;
        if (turn.connected) {
            icon = 'repeat';
            color = turn.textColor;
            name = turn.player;
        } else {
            icon = 'block';
            color = 'grey-text';
            name = turn.player + ' (Disconnected)';
        }
        li.innerHTML = `<a><i class="material-icons ${color}">${icon}</i> <pre>${name}</pre></a>`;
        turnsList.insertBefore(li, null);
    }
}

function refreshTeamsList(teams) {
    teamsList.innerHTML = "";
    for (let team of teams) {
        let li = document.createElement('li');
        li.innerHTML = `<a><i class="material-icons ${team.textColor}">people</i> <pre>${team.color}\t${team.score} pts</pre></a>`;
        teamsList.insertBefore(li, null);
    }
}

function get(selector, root = document) {
    return root.querySelector(selector);
}

function formatDate(date) {
    const h = "0" + date.getHours();
    const m = "0" + date.getMinutes();

    return `${h.slice(-2)}:${m.slice(-2)}`;
}

// GRID

function createGrid(size) {
    grid = new Array(size);
    board = document.getElementById("board");

    for (let i = 0; i < grid.length; i++) {
        grid[i] = new Array(size);
        for (let j = 0; j < grid.length; j++) {
            let panelFlip = document.createElement("div");
            panelFlip.style.height = (90 / size).toString() + 'vh';
            panelFlip.className = "dw-pnl dw-flp";
            panelFlip.id = "item." + i + "." + j;
            panelFlip.style.setProperty("grid-column", i+1);
            panelFlip.style.setProperty("grid-row", j+1);
            let panelFlipContent = document.createElement("div");
            panelFlipContent.className = "dw-pnl__cntnt dw-flp__cntnt table";
            panelFlip.insertBefore(panelFlipContent, null);
            let panelFlipContent_front = document.createElement("div");
            panelFlipContent_front.className = "dw-flp__pnl dw-flp__pnl--frnt tx--white bd--white tx--center bg--dkgreen table-cell";
            panelFlipContent.insertBefore(panelFlipContent_front, null);
            let panelFlipContent_back = document.createElement("div");
            panelFlipContent_back.className = "dw-flp__pnl dw-flp__pnl--bck bd--white tx--white tx--center bg--black table-cell";
            panelFlipContent.insertBefore(panelFlipContent_back, null);
            let p = document.createElement('p');
            p.innerHTML = "&#7864;&#7865;&#x0301;j&#7885;&#7864;&#7865;&#x0301;j&#7885; &#7864;&#7865;&#x0301;j&#7885;&#7864;&#7865;&#x0301;j&#7885;";
            p.className = 'hide grid-text';
            panelFlipContent_back.insertBefore(p, null);
            panelFlipContent_back.onclick = (ev) => {
                const id = ev.srcElement.parentElement.parentElement.id;
                console.log(id);
                sock.emit('request-flip', id);
            };
            // header = document.createElement("h1");
            // header.innerText = "Hidden Word";
            // panelFlipContent_back.insertBefore(header, null);
            grid[i][j] = panelFlip;
            board.insertBefore(panelFlip, null);
        }
    }
}

function flipCard(params) {
    if (params.frenzyEnabled === false && params.isActivePlayer !== (params.player === PERSON_NAME)) {
        return;
    }

    let parentPanel = document.getElementById(params.id);
    let contentPanel = parentPanel.firstElementChild;
    let backPanel = contentPanel.lastElementChild;
    let p = backPanel.firstElementChild;
    let frontPanel = contentPanel.firstElementChild;

    let pre = params.isActivePlayer ? `<i class='material-icons left'>star</i>` : '';
    let post = params.isActivePlayer ? `<i class='material-icons right'>star</i>` : '';
    let color = params.isActivePlayer ? 'black' : params.color;
    let name = params.isActivePlayer ? 'You' : params.player;
    let bgColor = params.isActivePlayer ? 'bg--black' : 'bg--grey';

    if (params.frenzyEnabled === false || (params.player === PERSON_NAME)) {
        M.toast({html: `${pre} ${name} picked the word: ${params.word} ${post}`,
            classes: `rounded ${color}`});
    }

    if (params.frenzyEnabled === false) backPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });

    p.innerHTML = params.word;
    p.classList.remove('hide');
    contentPanel.classList.remove("dw-flp__cntnt");
    frontPanel.classList.remove("bg--green");
    frontPanel.classList.add(bgColor);
    frontPanel.insertBefore(p, null);

    if (params.englishMeaning !== null) {
        botResponse(params.word, params.englishMeaning);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function match(params) {
    await sleep(1000);
    let bgColor = params.isActivePlayer ? 'bg--black' : 'bg--grey';
    let card1 = document.getElementById(params.id).firstElementChild;
    let card2 = document.getElementById(params.id2).firstElementChild;
    let card1Front = card1.firstElementChild;
    let card2Front = card2.firstElementChild;
    card1.lastElementChild.onclick = null;
    card2.lastElementChild.onclick = null;
    card1Front.classList.remove(bgColor);
    card2Front.classList.remove(bgColor);
    let colorClasses = params.color.split(" ");
    for (let cc of colorClasses) {
        card1Front.classList.add(cc);
        card2Front.classList.add(cc);
    }
    let name = params.isActivePlayer ? 'You' : params.player;
    M.toast({html: `${name} found a match!<br>${params.team} team: +${params.points} points!`,
        classes: `rounded ${params.color}`});
}

async function unflip(params) {
    await sleep(1000);
    let name = params.isActivePlayer ? 'You' : params.player;

    if (params.frenzyEnabled === false || (params.player === PERSON_NAME)) {
        M.toast({
            html: `${name} didn't find a match.`,
            classes: `rounded ${params.materializeColor}`
        });
    }

    await sleep(1000);
    resetCard(params.id);
    resetCard(params.id2);
}

async function resetCard(id) {
    let card = document.getElementById(id).firstElementChild;
    let cardFront = card.firstElementChild;
    let cardBack = card.lastElementChild;
    try {
        cardBack.insertBefore(cardFront.firstElementChild, null);
    } catch (err) {
        // Do nothing
    }
    cardBack.parentElement.classList.add("dw-flp__cntnt");
    cardFront.className = flip_front;
    cardBack.className = flip_back;
    cardBack.firstElementChild.classList.add('hide');
    cardBack.firstElementChild.innerText = "";
}

async function nextTurn(params) {
    const instance = M.Modal.getInstance(turnModal);
    turnModal.className = `modal bottom-sheet hoverable ${params.materializeColor}`;

    if (params.player.includes("'"))
        turnHeader.innerText = `${params.player} Turn`;
    else
        turnHeader.innerText = `${params.player}'s Turn`;
    instance.open();
    await sleep(1000);
    instance.close();
}

async function frenzyIntro() {
    const instance = M.Modal.getInstance(turnModal);
    turnModal.className = `modal bottom-sheet hoverable green`;
    turnHeader.innerText = `Frenzy Mode Activated!! START MATCHING NOW!`;

    instance.open();
    await sleep(1000);
    instance.close();
}

function showWin(params) {
    const instance = M.Modal.getInstance(turnModal);
    turnModal.className = `modal bottom-sheet hoverable grey`;
    turnModal.innerHTML = "";
    let ul = document.createElement('ul');
    ul.className = "collection with-header";
    turnModal.insertBefore(ul, null);
    let header = document.createElement('li');
    header.className = "collection-header";
    let winner;
    if (params.winners.team.length > 1) {
        winner = 'Draw!';
    } else {
        if (params.ffa) {
            winner = params.winners.team[0].toString();
            winner = (PERSON_NAME === winner) ? 'You' : winner;
        } else {
            winner = params.winners.team[0].toString() + ' Team';
        }
        winner += ' Won!';
    }
    header.innerHTML= `<h2>${winner}</h2>`;
    ul.insertBefore(header, null);
    for (let display of params.rankings) {
        let li = document.createElement('li');
        li.className = `collection-item avatar ${display.materializeColor}`;
        let img = document.createElement('img');
        img.src = "../img/team.svg";
        img.alt = "";
        img.className = `circle ${display.materializeColor}`;
        img.innerText = 'star';
        li.insertBefore(img, null);
        let span = document.createElement('span');
        span.innerText = display.player;
        span.className = 'title';
        li.insertBefore(span, null);
        let p = document.createElement('p');
        p.innerText = display.score + ' points';
        li.insertBefore(p, null);
        let a = document.createElement('a');
        a.className = "secondary-content";
        a.innerHTML = `<i class="material-icons">star</i>`;
        li.insertBefore(a, null);
        ul.insertBefore(li, null);
    }
    let exit = document.createElement('button');
    exit.className = 'btn waves-effect waves-light modal-trigger';
    exit.href = "#modal1";
    let i = document.createElement('i');
    i.className='material-icons';
    i.innerText = 'close';
    exit.insertBefore(i, null);
    exit.innerText = 'Quit Game';
    exit.onclick = (ev) => quitGame();
    turnModal.insertBefore(exit, null);
    instance.open();
}

function quitGame() {
    sessionStorage.removeItem("recallYorubaId");
    sessionStorage.removeItem("recallYorubaName");
    location.replace('./');
}

function refreshGrid(grid) {
    for (let x in grid) {
        for (let y in grid) {
            let id = `item.${x}.${y}`;
            if (!grid[x][y]) resetCard(id);
        }
    }
}

function botResponse(word, translation) {
    const r = random(0, BOT_PHRASES.length - 1);
    let msgText = BOT_PHRASES[r];
    msgText = msgText.replace("{0}", word);
    msgText = msgText.replace("{1}", translation);
    const delay = msgText.split(" ").length * 50;

    setTimeout(() => {
        appendMessage(BOT_NAME, BOT_IMG, "left", msgText);
    }, delay);
}

function random(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function initMode(mode, turn) {
    if (mode !== 'frenzy') {
        nextTurn(turn);
    } else {
        frenzyIntro();
    }

    if (mode === 'tutorial') {
        let tutPopup = document.getElementById('taptutorial');
        tutPopup.setAttribute('data-target', 'gamemenu');

        delayedBotMessage(`Ẹ kú àárọ! Hello, ${PERSON_NAME}. Welcome to the game. I am your guide in this mode, Chat Bot. :)`,
            1000);
        delayedBotMessage(`This is the in game menu. You can see your scores and turns here and can also chat with the other players.`,
            2000);
        delayedBotMessage(`To win the game, you have to match all the Yorùbá words with their English translations. To get started, wait for your turn and then click a square to unveil either a Yorùbá or an English word.`,
            5000);
        delayedBotMessage(`Check whose turn it is and what the scores are for each player or each team by changing tabs at the top of this menu.`,
            7000);
        delayedBotMessage(`And that's all there is to it. I will try to help you with words you might not know in this mode so check this chat if you don't know a Yorùbá word! Pade Orire (Good luck)!`,
            9000);

        let elems = document.querySelectorAll('.tap-target');
        M.TapTarget.init(elems);
        let instance = M.TapTarget.getInstance(tutPopup);
        instance.open();
    }
}

function delayedBotMessage(message, delay = 1000) {
    setTimeout(() => {
        appendMessage(BOT_NAME, BOT_IMG, "left", message);
    }, delay);
}

async function toggleTileSize() {
    if (actionInProgress) {
        toastAlert(`Please wait for "Toggle Tile Size" to finish!`);
    }
    actionInProgress = true;
    let newSize;
    fitScreen = !fitScreen;
    if (fitScreen)
        newSize = (90 / grid.length).toString() + 'vh';
    else
        newSize = (100 / grid.length).toString() + 'vw';
    for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[i].length; j++) {
            grid[i][j].style.height = newSize;
        }
    }
    sleep(500);
    toastAlert('Board updated!');
    actionInProgress = false;
}