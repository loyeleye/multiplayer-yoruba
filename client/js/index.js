function joinGame() {
    let name = document.getElementById('name').innerText;

    let http = new XMLHttpRequest();
    let url = 'lobby.html';
    let params = `name=${name}`;
    http.open('POST', url, true);

    http.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
}

const writeEvent = (text) => {
    const parent = document.querySelector("#events");
    const el = document.createElement('li');
    el.innerHTML = text;
    parent.appendChild(el);
};

writeEvent('Welcome to Recall-Yoruba!');