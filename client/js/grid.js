let grid = null;
let board = null;
let flippedCard = null;
const flip_front = "dw-flp__pnl dw-flp__pnl--frnt tx--white bd--white tx--center bg--dkgreen";
const flip_back = "dw-flp__pnl dw-flp__pnl--bck bd--white tx--white tx--center bg--black";

function createGrid(size) {
    grid = new Array(size);
    board = document.getElementById("board");

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function unflip(card1Front, card1Back, card2Front, card2Back) {
        await sleep(2000);
        card1Back.insertBefore(card1Front.firstElementChild, null);
        card2Back.insertBefore(card2Front.firstElementChild, null);
        card1Back.parentElement.classList.add("dw-flp__cntnt");
        card2Back.parentElement.classList.add("dw-flp__cntnt");
        card1Front.className = flip_front;
        card1Back.className = flip_back;
        card1Back.firstElementChild.classList.add('hide');
        card2Front.className = flip_front;
        card2Back.className = flip_back;
        card2Back.firstElementChild.classList.add('hide');
    }

    for (let i = 0; i < grid.length; i++) {
        grid[i] = new Array(size);
        for (let j = 0; j < grid.length; j++) {
            let panelFlip = document.createElement("div");
            panelFlip.style.height = (1600 / size).toString() + 'px';
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
                let backPanel = ev.srcElement;
                let panel = ev.srcElement.parentElement;
                let frontPanel = panel.firstElementChild;
                backPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                M.toast({html: `<i class='material-icons left'>star</i> You picked the word: ${backPanel.firstElementChild.innerHTML} <i class='material-icons right'>star</i>`,
                                    classes: 'rounded black'});
                backPanel.firstElementChild.classList.remove('hide');
                panel.classList.remove("dw-flp__cntnt");
                frontPanel.classList.remove("bg--green");
                frontPanel.classList.add("bg--black");
                frontPanel.insertBefore(p, null);
                if (flippedCard != null) {
                    unflip(flippedCard.firstElementChild, flippedCard.lastElementChild,
                        frontPanel, backPanel).then();
                    flippedCard = null;
                } else {
                    flippedCard = panel;
                }
            };
            // header = document.createElement("h1");
            // header.innerText = "Hidden Word";
            // panelFlipContent_back.insertBefore(header, null);
            grid[i][j] = panelFlip;
            board.insertBefore(panelFlip, null);
        }
    }
}