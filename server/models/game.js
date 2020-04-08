const dict = require('./dictionary');
const lobbyService = require('./lobby');

// Board
// Tiles
// Dictionary
// Turns
// Players:
// // Score
// Chat
// Handling disconnects/reconnects
class GameSettings {
    constructor() {
        this.mode = 'standard';
        this.ffa = true;
        this.size = 8;
        this.teams = [];
        this.categories = Object.keys(dict['byCategory']);
    }

    static movePlayerToTeam(player, team) {
        if (player.team === team) return;

        player.team.removeMember(player);
        team.addMember(player);
    }

    getMode() {
        let m = this.mode.charAt(0).toUpperCase() + this.mode.slice(1);
        if (m === 'Losers') m = 'Loser\'s Choice';
        return m;
    }

    getModeDesc() {
        return GameSettings.gameModes[this.mode];
    }

    getTeamMode() {
        return this.ffa ? 'Free For All' : 'Teams';
    }

    getTeamModeDesc() {
        return this.ffa ?
            'Everyone for themselves in a classic free-for-all. The player with the highest score wins.' :
            'Pair up with your friends in up to 4 teams. The team with the highest score wins.';
    }

    getBoardSize() {
        return this.size + 'x' + this.size;
    }

    refreshPlayerTeam(player) {
        for (let team of this.teams) {
            if (team.hasMember(player)) {
                team.addMember(player);
            } else {
                team.removeMember(player);
            }
        }
        return false;
    }
}

class Team {
    constructor(color) {
        this.colorCode = color;
        this.members = {};
    }

    length() {
        return Object.keys(this.members).length;
    }

    getMembers() {
        return Object.values(this.members);
    }

    getColor() {
        return Team.colorCodes[this.colorCode];
    }

    addMember(player) {
        this.members[player.name] = player;
        player.setTeam(this);
    }

    removeMember(player) {
        delete this.members[player.name];
        if (player.team === this) delete player.team;
    }

    refreshDisconnectedSocks(lobbyList) {
        for (let playerName of Object.keys(this.members)) {
            lobbyList[playerName].team = this;
            this.members[playerName] = lobbyList[playerName];
        }
    }

    hasMember(player) {
        return this.members.hasOwnProperty(player.name);
    }
}

GameSettings.gameModes = {
    tutorial: 'Meet <b>Coach Bot</b> --- he will be your guide in this mode. Type \'Hi Coach\' in chat to introduce yourself. If you are new to this game or are just not familiar with some Yorùbá words, give this mode a try!',
    standard: 'Think your memory skills are on point? On each player\'s turn, they will pick two cards from an open board of 16 to 200+ cards. If they pick the two cards that match, they score points for themselves or their team! When all cards have been paired and matched, the team with the most points wins. Time to see which of your friends has the best memory!',
    losers: 'This is the sore loser\'s mode of choice --- On each turn, one player picks a card for the next player and the next player must match the card. If they do match it, they get 2 points and can keep looking for additional matches for 1 point each. If they miss a match, they have to pick another card for the next player. Time to try your best to trip up your competition. You know what they say, right? If you can\'t beat them, annoy them!',
    stealth: "No peeking - You can't see your opponent's choices and they can't see yours. In this mode, you can only see the cards that you and your teammates flip. If you like more of a challenge, try this mode!",
    frenzy: '<b>No turns. No Waiting. Pure madness!</b> All players race against each other or opposing teams to match as many pairs as they can before time runs out! The players with the most pairs matched at the end win. <i>Warning: This mode is not recommended for the clinically sane.</i>'
};

Team.colorCodes = {
    1: ['Red', 'red', 'red-text'],
    2: ['Blue', 'blue darken-4', 'blue-text'],
    3: ['Yellow', 'yellow darken-2', 'yellow-text text-darken-2'],
    4: ['Brown', 'brown', 'brown-text'],
    5: ['Pink', 'purple accent-1', 'purple-text text-accent-1'],
    6: ['Cyan', 'light-blue lighten-1', 'light-blue-text text-lighten-1'],
    7: ['Orange', 'orange', 'orange-text'],
    8: ['Purple', 'deep-purple accent-3', 'deep-purple-text text-accent-3']
};

class Game {
    constructor(lobby, io) {
        this.io = io;
        this.lobby = lobby;
        this.settings = lobby.settings;
        this.countdownToStart = 1337;
        this.gameStarted = false;
        this.losersChoiceOnStreak = false;
        this.id = uuidv4();
        this.words = [];
        this.pointsPerMatch = 10;
        this.connections = {};
        this.teamChannels = new Set();
    }

    async countdown(votePercentage) {
        let countdown = 4;
        if (votePercentage > 0.99) {
            countdown = 0;
        } else if (votePercentage > 0.74) {
            countdown = 1;
        } else if (votePercentage > 0.49) {
            countdown = 2;
        } else if (votePercentage > 0.24) {
            countdown = 4;
        } else if (votePercentage > 0.01) {
            countdown = 6;
        }
        for (let c = countdown; c > 0; c--) {
            if (c >= this.countdownToStart || this.gameStarted) return null;
            this.countdownToStart = c;
            this.alert(`Game starting in ${(10*this.countdownToStart)} seconds...`);
            await sleep(10000).catch((err) => {
                this.alert("Game failed to countdown!");
                console.error(err);
            });
        }
        this.start().catch((err) => {
            this.alert("Game failed to start!");
            console.error(err);
        });
        return this.lobby.id;
    }

    async start() {
        if (this.gameStarted) return;
        this.alert(`Starting game...`);
        this.load();
        this.gameStarted = true;
    }

    load() {
        this.loadTeamColors();
        this.loadOrder();
        this.loadWords();
        this.loadScores();
        this.loadMatchGrid();
        this.disableFlip = false;
    }

    loadWords() {
        if (this.words.length > 0) return;

        let allWords = [];
        for (let c of this.settings.categories) {
            allWords = allWords.concat(dict['byCategory'][c]);
        }
        let numWords = this.settings.size ** 2;

        if (numWords > 2*allWords.length)
            throw `Number of words needed for board ${numWords} is greater than number of words available in the available categories: ${this.settings.categories}`;

        let words = [];

        if (this.settings.mode === 'tutorial') {
            this.yorubaToEnglishTranslation = {};
            for (let _ = 0; _ < numWords/2; _++) {
                let i = random(0, allWords.length - 1);
                let twoWords = allWords.splice(i, 1)[0];
                this.yorubaToEnglishTranslation[twoWords[1]] = twoWords[0];
                words.push(...twoWords);
            }
        } else {
            for (let _ = 0; _ < numWords/2; _++) {
                let i = random(0, allWords.length - 1);
                let twoWords = allWords.splice(i, 1)[0];
                words.push(...twoWords);
            }
        }

        this.words = shuffle(words);
    }

    loadMatchGrid() {
        let size = this.settings.size;
        let rows = [];
        for (let i = 0; i < size; i++) {
            let cols = [];
            for (let j = 0; j < size; j++) {
                let val = false;
                cols.push(val);
            }
            rows.push(cols);
        }
        this.matchGrid = rows;
    }

    loadOrder() {
        let playerTeams = this.lobby.getPlayerTeams();
        this.flippedCard = {};
        let order = [];
        this.playerDetails = {};
        for (let p in playerTeams) {
            let color = playerTeams[p];
            let details = {
                player: p,
                connected: true,
                color: color[0],
                materializeColor: color[1],
                textColor: color[2]
            };
            if (this.settings.mode === 'frenzy') {
                this.playerDetails[p] = details;
            } else {
                order.push(details);
            }
            this.flippedCard[p] = null;
        }
        this.flippedCard[' _loser'] = null;
        this.order = shuffle(order);
        this.turn = 0;
    }

    setConnection(player, isConnected) {
        this.connections[player] = isConnected;
    }

    loadScores() {
        let scores = {};
        this.teamScoreDisplay = [];
        if (!this.settings.ffa) {
            let teamScores = {};
            for (let team of this.settings.teams) {
                if (team.length() > 0) {
                    teamScores[team.colorCode] = 0;
                    let teamScoreDisplayElement = {
                        team: team.colorCode,
                        color: Team.colorCodes[team.colorCode][0],
                        materializeColor: Team.colorCodes[team.colorCode][1],
                        textColor: Team.colorCodes[team.colorCode][2],
                        score: 0
                    };
                    this.teamScoreDisplay.push(teamScoreDisplayElement);
                }
            }
            this.teamScores = teamScores;
        }
        for (let p of this.lobby.getPlayers()) {
            scores[p] = 0;
        }
        this.scores = scores;
        let scoreDisplay = [];
        for (let key of Object.keys(this.scores)) {
            let scoreDisplayElement = {
                score: this.scores[key],
                player: key,
                color: this.colors[key][0],
                materializeColor: this.colors[key][1],
                textColor: this.colors[key][2]
            };
            scoreDisplay.push(scoreDisplayElement);
        }
        this.scoreDisplay = scoreDisplay;
    }

    loadTeamColors() {
        this.colors = this.lobby.getPlayerTeams();
    }

    addScore(playerName, increment) {
        this.scores[playerName] += increment;
        let score = this.scores[playerName];
        this.scoreDisplay = Game.updateScoreDisplay(
            this.scoreDisplay, 'player', playerName, score
        );
        if (!this.settings.ffa) {
            let updateTeam = this.lobby.players[playerName].team;
            this.teamScores[updateTeam] += increment;
            score = this.teamScores[updateTeam];
            this.teamScoreDisplay = Game.updateScoreDisplay(
                this.teamScoreDisplay, 'team', updateTeam, score
            );
        }
    }

    static updateScoreDisplay(scoreDisplay, keyName, key, score) {
        for (let i = 0; i < scoreDisplay.length; i++) {
            let scoreDisplayElement = scoreDisplay[i];
            if (scoreDisplayElement[keyName] === key) {
                scoreDisplayElement['score'] = score;
                scoreDisplay.splice(i, 1);
                return insertBinarySearch(scoreDisplay, scoreDisplayElement, greatestScoreFirstComparator);
            }
        }
    }

    updatePlayerConnection(player, isConnected) {
        this.setConnection(player, isConnected);
        for (let turn of this.order) {
            if (turn.player === player) {
                turn.connected = isConnected;
                if (isConnected) {
                    this.alert(`${player} joined the game.`);
                    this.toastAlert(`<i class="material-icons left">check_circle</i>${player} joined the game.`, `rounded ${turn.materializeColor}`);
                } else {
                    this.alert(`${player} left the game.`);
                    this.toastAlert(`<i class="material-icons left">cancel</i>${player} left the game.`, `rounded ${turn.materializeColor}`);
                }
                if (turn.connected === false) {
                    let allDisconnected = true;

                    for (let connection of Object.values(this.connections)) {
                        if (connection) {
                            allDisconnected = false;
                            break;
                        }
                    }

                    if (allDisconnected) {
                        this.endGame();
                        return;
                    }

                    this.endTurn(0);
                    return;
                }

                this.refreshLists();
                this.refreshGrid();
            }
        }
    }

    updateMatchGrid(id1, id2) {
        let coords1 = id1.split('.');
        let coords2 = id2.split('.');
        let c1 = {
            x: parseInt(coords1[1]),
            y: parseInt(coords1[2])
        };
        let c2 = {
            x: parseInt(coords2[1]),
            y: parseInt(coords2[2])
        };
        if (this.matchGrid[c1.x][c1.y] || this.matchGrid[c2.x][c2.y]) {
            throw "Pair already matched!";
        }
        this.matchGrid[c1.x][c1.y] = true;
        this.matchGrid[c2.x][c2.y] = true;
    }

    displayTurns() {
        let beforeTurn = Array.from(this.order);
        let afterTurn = beforeTurn.splice(this.turn, this.order.length - this.turn);
        return afterTurn.concat(beforeTurn);
    }

    getActive() {
        while (this.order[this.turn % this.order.length].connected === false) this.turn++;
        let turn = this.turn % this.order.length;
        return this.order[turn];
    }

    alert(msg) {
        const room = this.gameStarted ? this.id : this.lobby.id;
        this.io.to(`${room}`).emit('chat-alert', msg);
    }

    toastAlert(msg, cssClasses) {
        const room = this.gameStarted ? this.id : this.lobby.id;
        this.io.to(`${room}`).emit('toast-alert', {text: msg, classes: cssClasses});
    }

    async refreshGrid() {
        this.io.to(`${this.id}`).emit('refresh-grid', this.matchGrid);
    }

    async flipCardStandard(card, playerName) {
        let otherCard = this.flippedCard[playerName];
        let word = this.getWord(card);
        let match = false;

        if (otherCard === null) {
            this.flippedCard[playerName] = card;
        } else {
            let otherWord = this.getWord(otherCard);

            match = (word === dict.lookup.english[otherWord] ||
                word === dict.lookup.yoruba[otherWord]);

            this.flippedCard[playerName] = null;
        }

        let translation = null;

        if (this.settings.mode === 'tutorial' && word in this.yorubaToEnglishTranslation) {
            translation = this.yorubaToEnglishTranslation[word];
        }

        return {
            id: card,
            id2: otherCard,
            player: playerName,
            isActivePlayer: false,
            word: this.getWord(card),
            color: this.getActive().materializeColor,
            team: this.getActive().color,
            match: match,
            points: this.pointsPerMatch,
            englishMeaning: translation,
            frenzyEnabled: false
        };
    }

    async flipCardLosersChoice(card, playerName) {
        let otherCard = this.flippedCard[' _loser'];
        let word = this.getWord(card);
        let match = false;

        if (otherCard === null) {
            this.flippedCard[' _loser'] = card;
        } else {
            let otherWord = this.getWord(otherCard);

            match = (word === dict.lookup.english[otherWord] ||
                word === dict.lookup.yoruba[otherWord]);

            this.flippedCard[' _loser'] = null;
        }

        return {
            id: card,
            id2: otherCard,
            player: playerName,
            isActivePlayer: false,
            word: this.getWord(card),
            color: this.getActive().materializeColor,
            team: this.getActive().color,
            match: match,
            points: this.pointsPerMatch,
            englishMeaning: null,
            frenzyEnabled: false
        };
    }

    async flipCardFrenzy(card, playerName) {
        let otherCard = this.flippedCard[playerName];
        let word = this.getWord(card);
        let match = false;

        if (otherCard === null) {
            this.flippedCard[playerName] = card;
        } else {
            let otherWord = this.getWord(otherCard);

            match = (word === dict.lookup.english[otherWord] ||
                word === dict.lookup.yoruba[otherWord]);

            this.flippedCard[playerName] = null;
        }

        return {
            id: card,
            id2: otherCard,
            player: playerName,
            isActivePlayer: false,
            word: this.getWord(card),
            color: this.playerDetails[playerName].materializeColor,
            team: this.playerDetails[playerName].color,
            match: match,
            points: this.pointsPerMatch,
            englishMeaning: null,
            frenzyEnabled: true
        };
    }

    getWord(cardId) {
        let idParts = cardId.split('.');
        let idx = parseInt(idParts[1]) * this.settings.size + parseInt(idParts[2]);
        return this.words[idx];
    }

    async endTurn(delay = 2) {
        await sleep(delay * 1000);
        this.disableFlip = false;
        this.turn++;
        if (this.order.length > 1) this.nextTurn();
        this.refreshLists();
        if (this.settings.mode !== 'losers') {
            this.refreshGrid();
        }
    }

    nextTurn() {
        this.io.to(`${this.id}`).emit('next-turn', this.getActive());
    }

    refreshLists() {
        const params = {
            scorelist: this.scoreDisplay,
            turnslist: this.displayTurns(),
            teamslist: this.teamScoreDisplay
        };
        this.io.to(`${this.id}`).emit('refresh-list', params);
    }

    refresh(sock) {
        const params = {
            scorelist: this.scoreDisplay,
            turnslist: this.displayTurns(),
            teamslist: this.teamScoreDisplay
        };
        sock.emit('refresh-list', params);
    }

    gridIsAllMatched() {
        let allMatched = true;
        for (let i in this.matchGrid) {
            for (let j in this.matchGrid[i]) {
                allMatched = allMatched && this.matchGrid[i][j];
                if (!allMatched) break;
            }
            if (!allMatched) break;
        }
        return allMatched;
    }

    async checkWin() {
        if (this.gridIsAllMatched()) {
            let maxScore = {
                team: null,
                score: -1
            };

            let scores = (this.settings.ffa) ? this.scores : this.teamScores;

            for (let p in scores) {
                if (scores[p] > maxScore.score) {
                    maxScore.score = scores[p];
                    maxScore.team = [p];
                } else if (scores[p] === maxScore.score) {
                    maxScore.team.push(p);
                }
            }
            let params = {
                ffa: this.settings.ffa,
                winners: maxScore,
                rankings: this.settings.ffa ? this.scoreDisplay : this.teamScoreDisplay
            };

            this.io.to(`${this.id}`).emit('response-win', params);
            await sleep(10000);
            this.endGame();
        }
    }

    endGame() {
        this.io.to(`${this.id}`).emit('dc');
        delete this.lobby.game;
        try {
            lobbyService.endLobby(this.lobby.id);
        } catch (err) {
            console.warn(err);
        }
        delete this.lobby;
        delete lobbyService.activeGames[this.id];
        delete this;
    }
}

function gameEvents(sock, lobbyService) {
    sock.on('request-refresh', () => {
        let game = lobbyService.getLobbyFor(sock).game;

        game.refresh(sock);
    });

    sock.on('request-flip', id => {
        let callingPlayer = lobbyService.sockets[sock.id];
        let game;
        try {
            game = lobbyService.getLobbyFor(sock).game;
        } catch {
            sock.emit('dc');
            return;
        }

        if (game.disableFlip === true) return;
        if (game.settings.mode !== 'frenzy' && callingPlayer.name !== game.getActive().player) return;
        game.disableFlip = true;

        if (game.settings.mode === 'standard' || game.settings.mode === 'tutorial') {
            game.flipCardStandard(id, callingPlayer.name).then((params) => {
                sock.broadcast.to(`${game.id}`).emit('response-flip',params);
                params.isActivePlayer = true;
                sock.emit('response-flip', params);
                if (params.englishMeaning !== null) {
                    game.toastAlert(`"${params.word}": "${params.englishMeaning}"`);
                }
                if (params.id2 !== null) {
                    params.isActivePlayer = false;
                    if (params.match) {
                        try {
                            game.updateMatchGrid(params.id, params.id2);
                        } catch (err) {
                            console.warn(`${callingPlayer.name} caused error: ${err}. Kicked from game as precaution.`);
                            sock.emit('dc');
                            game.alert(`${callingPlayer.name} has been kicked from the game.`);
                        }
                        sock.broadcast.to(`${game.id}`).emit('response-match',params);
                        params.isActivePlayer = true;
                        sock.emit('response-match', params);
                        game.addScore(callingPlayer.name, params.points);
                        game.checkWin();
                        game.disableFlip = false;
                    } else {
                        sock.broadcast.to(`${game.id}`).emit('response-unflip',params);
                        params.isActivePlayer = true;
                        sock.emit('response-unflip', params);
                        game.endTurn();
                    }
                } else {
                    game.disableFlip = false;
                }
            }).catch(err => {
                console.error(err);
            });
        } else if (game.settings.mode === 'losers') {
            game.flipCardLosersChoice(id, callingPlayer.name).then((params) => {
                sock.broadcast.to(`${game.id}`).emit('response-flip',params);
                params.isActivePlayer = true;
                sock.emit('response-flip', params);
                if (params.id2 !== null) {
                    params.isActivePlayer = false;
                    if (params.match) {
                        try {
                            game.updateMatchGrid(params.id, params.id2);
                        } catch (err) {
                            console.warn(`${callingPlayer.name} caused error: ${err}. Kicked from game as precaution.`);
                            sock.emit('dc');
                            game.alert(`${callingPlayer.name} has been kicked from the game.`);
                        }
                        sock.broadcast.to(`${game.id}`).emit('response-match',params);
                        params.isActivePlayer = true;
                        sock.emit('response-match', params);
                        game.addScore(callingPlayer.name, params.points);
                        game.checkWin();
                        game.disableFlip = false;
                        game.losersChoiceOnStreak = true;
                    } else {
                        sock.broadcast.to(`${game.id}`).emit('response-unflip',params);
                        params.isActivePlayer = true;
                        sock.emit('response-unflip', params);
                        game.disableFlip = false;
                        game.losersChoiceOnStreak = false;

                    }
                } else {
                    if (game.losersChoiceOnStreak) {
                        game.disableFlip = false;
                    } else {
                        game.endTurn();
                    }
                }
            }).catch(err => {
                console.error(err);
            });
        } else if (game.settings.mode === 'stealth') {
            game.flipCardStandard(id, callingPlayer.name).then((params) => {
                let show = (' ' + params.word).slice(1);
                let hide = "???";
                if (!game.settings.ffa) {
                    let teamChannel = `${game.id}` + '_' + `${callingPlayer.team.colorCode}`;
                    for (let channel of game.teamChannels.keys()) {
                        if (teamChannel === channel) {
                            params.word = show;
                            params.isActivePlayer = true;
                            sock.emit('response-flip',params);
                            params.isActivePlayer = false;
                            sock.broadcast.to(`${teamChannel}`).emit('response-flip',params);
                        } else {
                            params.word = hide;
                            params.isActivePlayer = false;
                            game.io.to(`${channel}`).emit('response-flip',params);
                        }
                    }
                } else {
                    params.word = hide;
                    sock.broadcast.to(`${game.id}`).emit('response-flip',params);
                    params.word = show;
                    params.isActivePlayer = true;
                    sock.emit('response-flip', params);
                }
                if (params.id2 !== null) {
                    params.isActivePlayer = false;
                    if (params.match) {
                        try {
                            game.updateMatchGrid(params.id, params.id2);
                        } catch (err) {
                            console.warn(`${callingPlayer.name} caused error: ${err}. Kicked from game as precaution.`);
                            sock.emit('dc');
                            game.alert(`${callingPlayer.name} has been kicked from the game.`);
                        }
                        sock.broadcast.to(`${game.id}`).emit('response-match',params);
                        params.isActivePlayer = true;
                        sock.emit('response-match', params);
                        game.addScore(callingPlayer.name, params.points);
                        game.checkWin();
                        game.disableFlip = false;
                    } else {
                        sock.broadcast.to(`${game.id}`).emit('response-unflip',params);
                        params.isActivePlayer = true;
                        sock.emit('response-unflip', params);
                        game.endTurn();
                    }
                } else {
                    game.disableFlip = false;
                }
            }).catch(err => {
                console.error(err);
            });
        } else if (game.settings.mode === 'frenzy') {
            game.disableFlip = false;
            game.flipCardFrenzy(id, callingPlayer.name).then((params) => {
                sock.broadcast.to(`${game.id}`).emit('response-flip',params);
                params.isActivePlayer = true;
                sock.emit('response-flip', params);
                if (params.id2 !== null) {
                    params.isActivePlayer = false;
                    if (params.match) {
                        try {
                            game.updateMatchGrid(params.id, params.id2);
                        } catch (err) {
                            console.warn(`${callingPlayer.name} caused error: ${err}. Kicked from game as precaution.`);
                            sock.emit('dc');
                            game.alert(`${callingPlayer.name} has been kicked from the game.`);
                        }
                        sock.broadcast.to(`${game.id}`).emit('response-match',params);
                        params.isActivePlayer = true;
                        sock.emit('response-match', params);
                        game.addScore(callingPlayer.name, params.points);
                        game.checkWin();
                    } else {
                        sock.broadcast.to(`${game.id}`).emit('response-unflip',params);
                        params.isActivePlayer = true;
                        sock.emit('response-unflip', params);
                    }
                } else {
                    game.disableFlip = false;
                }
            }).catch(err => {
                console.error(err);
            });
        }
    });
}

/**
 * Scores are objects with a "score" attribute
 * @param insertScore
 * @param existingScore
 */
function greatestScoreFirstComparator(insertScore, existingScore) {
    if (insertScore['score'] > existingScore['score']) return -1;
    if (insertScore['score'] === existingScore['score']) return 0;
    if (insertScore['score'] < existingScore['score']) return 1;
}

function binarySearch(arr, findElem, comparator) {
    let low = 0;
    let high = arr.length - 1;

    while (low < high) {
        let mid = low + (high - low) / 2;
        switch (comparator(findElem, arr[mid])) {
            case 0:
                return mid;
            case -1:
                high = mid - 1;
                break;
            case 1:
                low = mid + 1;
                break;
        }
    }
    return -1;
}

/**
 *
 * @param arr the array to insert the new element
 * @param newElem Element to insert into the array
 * @param comparator A function that can compare newElem with an element in the array and returns
 *          -1 if the newElement is less,
 *          1 if the newElement is greater,
 *          0 if the two elements are equal in value
 */
function insertBinarySearch(arr, newElem, comparator) {
    let lastMove = 0;
    let low = 0;
    let high = arr.length - 1;
    let mid;

    while (low < high) {
        mid = Math.floor(low + ((high - low) / 2));
        switch (comparator(newElem, arr[mid])) {
            case 0:
                arr.splice(mid,0,newElem);
                return arr;
            case -1:
                high = mid - 1;
                lastMove = -1;
                break;
            case 1:
                low = mid + 1;
                lastMove = 1;
                break;
        }
    }

    if (lastMove === 1) {
        arr.splice(mid+1,0,newElem);
    } else {
        arr.splice(mid,0,newElem);
    }

    return arr;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function random(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function shuffle(arr) {
    for (let i = 0; i < arr.length; i++) {
        let r = random(0, arr.length - 1);
        swap(arr, i, r);
    }
    return arr;
}

function swap(arr, i, j) {
    let temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
    return arr;
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

module.exports.GameSettings = GameSettings;
module.exports.Game = Game;
module.exports.Team = Team;
module.exports.Events = gameEvents;