const http = require('http');
const express = require('express');
const session = require('cookie-session');
const socketio = require('socket.io');
const lobbyService = require('./models/lobby');
const gameEvents = require('./models/game').Events;
const bent = require('bent');
// const dict = require('./models/dictionary');
// const dictionary = new dict.Dictionary();
// const materialize = require('materialize');
const GameSettings = require('./models/game').GameSettings;

const dict = require('./models/dictionary');
const allCategories = Object.keys(dict['byCategory']);
const app = express();

const PORT = process.env.PORT || 3000;
const INDEX = '/client/index.html';

const server = express()
    .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
    .listen(PORT, () => console.log(`Listening on ${PORT}`));

const io = socketio(server);

const clientPath = `${__dirname}/../client`;

app.set('port', (process.env.PORT || 5000));
app.set('views', './views');
app.set('view engine', 'pug');
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(clientPath));
app.use(session({secret: uuidv4()}));
console.log(`Serving static from ${clientPath}`);

app.get('/', function(req, res) {
    res.render('index');
});

app.get('/lobby', function(req, res) {
    res.redirect('/');
});

app.post('/lobby', (req, res) => {
    req.body.name.trim();
    if (req.body.name.length > 15 || req.body.name.length === 0) {
        let msg = `Please pick a name between 1 and 15 characters long.`;
        res.render('index', {message: msg});
        return;
    }
    if (req.body.name.indexOf(' ') >= 0) {
        let msg = `Please pick a name with no whitespace characters.`;
        res.render('index', {message: msg});
        return;
    }
    let addAttempt = lobbyService.addPlayer(req.body.name);
    if (addAttempt === 'collision') {

        let msg = `There is already a player with the name "${req.body.name}" in the lobby! Please choose a different name to join this lobby.`;
        res.render('index', {message: msg});
        return;
    }

    const lobby = lobbyService.activeLobby;

    res.render('lobby', {lobbyList: lobbyService.getPlayers(),
                            lobbyId: lobbyService.getLobbyId(),
                            pName: req.body.name,
                            modeTitle: lobby.settings.getMode(),
                            modeDesc: lobby.settings.getModeDesc(),
                            boardSize: lobby.settings.getBoardSize(),
                            teamTitle: lobby.settings.getTeamMode(),
                            teamModeDesc: lobby.settings.getTeamModeDesc(),
                            teamModeFFA: lobby.settings.ffa,
                            currentThemes: lobby.settings.categories,
                            allThemes: Object.keys(dict['byCategory'])});
});

app.get('/game', (req, res) => {
    console.log('get');

    try {
        let sess = req.session;

        let game = lobbyService.activeGames[sess.recallYorubaId];
        let player = game.lobby.players[player];

        if (typeof game === 'undefined' || typeof player === 'undefined') {
            res.redirect('/');
            return;
        }

        res.render('game', {
            gameId: sess.recallYorubaId,
            pName: sess.recallYorubaName,
            size: game.settings.size,
            disableTeams: game.settings.ffa ? 'disabled' : '',
            scorelist: game.scoreDisplay,
            turnslist: game.displayTurns(),
            teamslist: game.teamScoreDisplay
        });
    } catch (err) {
        console.error(err);
    }


    res.redirect('/');
});

app.post('/game', (req, res) => {
    let game = lobbyService.activeGames[req.body.gameId];
    if (typeof game === 'undefined' || game === null) {
        res.redirect('/');
        return;
    }

    res.render('game', {
        gameId: game.id,
        gameMode: game.settings.mode,
        pName: req.body.name,
        size: game.settings.size,
        disableTeams: game.settings.ffa ? 'disabled' : '',
        scorelist: game.scoreDisplay,
        turnslist: game.displayTurns(),
        teamslist: game.teamScoreDisplay,
        firstTurn: game.settings.mode === 'frenzy' ? null : game.getActive()
    });
});

io.on('connection', (sock) => {
    sock.emit('request-connect');

    sock.on('chat', params => {
        io.emit('chat', params);
    });

    sock.on('chat-bot', (name) => {
        const lobby = lobbyService.getLobbyIdFor(sock);
        getCorporate().then((phrase) => {
            let prefix = prefixes[(random(0,prefixes.length-1))];
            let message = prefix + phrase.toUpperCase() + '.';
            io.to(lobby).emit('chat-bot', message);
        });
    });

    sock.on('response-connect', (name) => {
        try {
            lobbyService.getPlayerFromActiveLobby(name).setSocket(sock);
            sock.join(`${lobbyService.activeLobby.id}`);
            io.to(`${lobbyService.activeLobby.id}`).emit('connect-alert', {
                alert: `${name} has joined the lobby.`,
                players: lobbyService.activeLobby.getPlayerTeams()
            });
            console.log(`${name} connected to lobby ${lobbyService.activeLobby.id} - sock# ${sock.id}`);
        } catch {
            console.log('response-connect');
            sock.emit('dc');
        }
    });

    sock.on('game-connect', (credentials) => {
        try {
            let game = lobbyService.activeGames[credentials.id];
            sock.join(`${game.id}`);
            let player;
            if (game.lobby.players.hasOwnProperty(credentials.name))
                player = game.lobby.players[credentials.name];
            else
            {
                game.lobby.addPlayer(credentials.name, false);
                player = game.lobby.players[credentials.name];
                game.settings.refreshPlayerTeam(player);
            }
            if (!game.settings.ffa) {
                console.log('game connecting');
                let teamChannel = `${game.id}` + '_' + `${player.team.colorCode}`;
                game.teamChannels.add(teamChannel);
                sock.join(teamChannel);
            }
            player.setSocket(sock);
            game.updatePlayerConnection(player.name, true);
            io.to(`${game.id}`).emit('connect-alert', `${credentials.name} joined the game.`);
            console.log(`${credentials.name} connected to game ${credentials.id} - sock# ${sock.id}`);
        } catch (err) {
            sock.emit('dc');
        }
    });

    sock.on('lobby-config', (settings) => lobbyConfig(settings, sock));

    sock.on('start-game', () => {
        try {
            let lobby = lobbyService.getLobbyFor(sock);
            let player = lobbyService.sockets[sock.id];
            let vote = lobby.voteStart(player.name);
            if (vote) {
                lobby.startGame(io, player.name);
            }
        } catch (err) {
            console.log(err);
            sock.disconnect();
        }
    });

    sock.on('disconnect', () => {
        try {
            console.log(`disconnecting sock# ${sock.id}`);
            let player = lobbyService.sockets[sock.id];
            lobbyService.removePlayer(player.name, player.lobbyId);
            io.to(`${player.lobbyId}`).emit('connect-alert', {
                alert: `${player.name} has left the lobby.`,
                players: lobbyService.lobbyTracker[player.lobbyId].getPlayerTeams()
            });
            let game = lobbyService.lobbyTracker[player.lobbyId].game;
            if (game !== null && game.connections.hasOwnProperty(player.name)) {
                game.updatePlayerConnection(player.name,false);
            }
            delete lobbyService.sockets[sock.id];
        } catch (err) {
            console.warn('Player not found for disconnected socket.');
        }
    });

    gameEvents(sock, lobbyService);
});

server.on('error', (err) => {
    console.error('Server error:', err);
});

function lobbyConfig(settings, sock) {
    try {
        const lobby = lobbyService.getLobbyFor(sock);
        if (lobby.game !== null && lobby.game.gameStarted) return;
        let lobbySettings = lobby.settings;
        let playerName = lobbyService.sockets[sock.id].name;
        let player = lobbyService.sockets[sock.id];
        let params = {};
        switch (settings[0]) {
            case 'set':
                switch (settings[1]) {
                    case 'mode':
                        lobbySettings.mode = settings[2];
                        params = {
                            set: 'mode',
                            mode: lobbySettings.getMode(),
                            message: '',
                            alert: ''
                        };
                        params.message = GameSettings.gameModes[settings[2]];
                        params.alert = `${playerName} set the game mode to "${params.mode}".`;
                        break;
                    case 'team':
                        lobbySettings.ffa = (settings[2] !== 'teams');
                        const teamMode = lobbySettings.getTeamMode();
                        let message = lobbySettings.getTeamModeDesc() + '<br><br>';
                        params = {
                            set: 'team',
                            ffa: lobbySettings.ffa,
                            title: teamMode,
                            players: lobbyService.getLobbyFor(sock).getPlayerTeams(),
                            message: message,
                            alert: `${playerName} set the team mode to "${teamMode}".`
                        };
                        break;
                    case 'theme':
                        lobbySettings.categories = (settings[2] === 'all') ? allCategories : [];
                        params = {
                            set: 'theme',
                            themes: lobbySettings.categories,
                            alert: (settings[2] === 'all') ?
                                `${playerName} added all themes to the list.` :
                                `${playerName} cleared all themes from the list.`
                        };
                        break;
                    case 'size':
                        lobbySettings.size = settings[2];
                        params = {
                            set: 'size',
                            size: `<i>Board Size: ${lobbySettings.getBoardSize()}</i>`,
                            alert: `${playerName} set the board size to "${lobbySettings.getBoardSize()}".`
                        };
                        break;
                }
                io.to(`${lobbyService.getLobbyIdFor(sock)}`).emit('config-alert',params);
                break;
            case 'change':
                switch (settings[1]) {
                    case 'team':
                        GameSettings.movePlayerToTeam(player, lobbySettings.teams[settings[2]-1]);
                        io.to(`${lobbyService.getLobbyIdFor(sock)}`).emit('update-lobbylist',
                            lobbyService.getLobbyFor(sock).getPlayerTeams());
                        break;
                    case 'theme':
                        settings[3] = settings[3].replace(/^\s+|\s+$/gm,'');
                        switch (settings[2]) {
                            case 'delete':
                                for (let i = 0; i < lobbySettings.categories.length; i++) {
                                    if (lobbySettings.categories[i] === settings[3]) {
                                        lobbySettings.categories.splice(i, 1);
                                        io.to(`${lobbyService.getLobbyIdFor(sock)}`).emit('update-chips',
                                            {
                                                action: settings[2],
                                                theme: settings[3]
                                            });
                                        break;
                                    }
                                }
                                break;
                            case 'add':
                                for (let i = 0; i < lobbySettings.categories.length; i++) {
                                    if (settings[3] === lobbySettings.categories[i]) {
                                        return;
                                    }
                                }
                                let found = false;
                                for (let i = 0; i < allCategories.length; i++) {
                                    if (settings[3] === allCategories[i]) {
                                        found = true;
                                        break;
                                    }
                                }
                                if (!found) {
                                    lobbyConfig(['change','theme','delete',settings[3]], sock);
                                    return;
                                }
                                lobbySettings.categories.push(settings[3]);
                                io.to(`${lobbyService.getLobbyIdFor(sock)}`).emit('update-chips',
                                    {
                                        action: settings[2],
                                        theme: settings[3]
                                    });
                                break;
                        }
                        break;
                }
                break;
        }
    } catch (err) {
        console.error(err);
    }
}

const prefixes = [
    "To WIN, you must ",
    "The best players in THIS game ",
    "You aren't the BEST until you ",
    "You have potential. But take it from me - You CAN'T succeed until you ",
    "You AREN'T good until you are a player who can ",
    "My colleague robots and I have reached the PINNACLE of skill. Only with us can you ",
    "Buy my coaching lessons for 10 million Naira and you will learn to COMPLETELY outperform your competition and ",
    "Buy my coaching lessons for 1 million Euros and you will learn to DEMOLISH your competition and ",
    "Buy my coaching lessons for 2 million Dollars and you will learn to CRUSH your competition and ",
    "Skeptical of my coaching program? Read a review from one of my MANY clients as told by myself. I showed her how to ",
    "Skeptical of my coaching program? Read a review from one of my many clients as told by myself. I gave him the KNOWLEDGE to ",
    "You CAN'T lose if you ",
    "With DATA MINING and ARTIFICIAL INTELLIGENCE, you can explode your overall competency and ",
    "Buy my coaching program. I will teach you to simultaneously improve your OVERALL cognitive ability and ",
    "You really AREN'T improving if you don't "
];

const getCorporate = async function () {
    let resp = '';
    try {
        const get = bent('https://corporatebs-generator.sameerkumar.website/', 'GET', 'json', 200);
        let resp = await get();
        return resp['phrase'];
    } catch {
        console.log('Bot unable to talk. Something went wrong in API call!');
        try {
            console.log(resp);
        } catch {
            console.log('Unable to show returned response');
        }
    }
};

function random(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}