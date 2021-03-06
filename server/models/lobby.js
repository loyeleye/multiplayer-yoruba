const Team = require('./game').Team;
const GameSettings = require('./game').GameSettings;
const Game = require('./game').Game;

const MAX_PLAYERS = 8;

class Lobby {
    constructor(password = null) {
        this.id = uuidv4();
        this.players = {};
        this.votesToStart = new Set();
        this.settings = new GameSettings();
        this.settings.teams.push(new Team(1));
        this.settings.teams.push(new Team(2));
        this.settings.teams.push(new Team(3));
        this.settings.teams.push(new Team(4));
        this.game = null;
        this.password = password;
    }

    addPlayer(name, inLobby = true) {
        const lobbySize = Object.keys(this.players).length;
        if (lobbySize >= MAX_PLAYERS) return 'full';
        if (name in this.players) return 'collision';
        let player = new Player(name, this.id);
        this.players[name] = player;
        if (inLobby) {
            let team = (this.settings.teams[0].length() > this.settings.teams[1].length()) ? 1 : 0;
            this.settings.teams[team].addMember(player);
        }
        let teams = this.getPlayerTeams(true);
        let color = teams[name][0];
        player.setImageToColorDefault(color);
        return player;
    }

    resetImages() {
        let teams = this.getPlayerTeams();
        for (let name in teams) {
            let color = teams[name][0];
            player.setImageToColorDefault(color);
        }
    }

    async startGame(io, initiator) {
        this.alert(io, `${initiator} wants to start the game.`);

        if (this.game === null) this.game = new Game(this, io);
        this.game.countdown(this.getPercentageForStartGame()).then(function(id) {
            if (id !== null) {
                console.log(`Game started for lobby: ${id}`);
                let lobby = lobbyServiceInstance.lobbyTracker[id];
                lobbyServiceInstance.activeGames[lobby.game.id] = lobby.game;
                if (lobbyServiceInstance.activeLobby === lobby)
                    lobbyServiceInstance.refillOrCreateLobby();
                console.log(`Start uuid = ${lobby.game.id}`);
                if (lobby.password !== null) {
                    delete lobbyServiceInstance.privateLobbies[lobby.password];
                    lobby.password = null;
                }
                io.to(`${lobby.id}`).emit('goto-game', lobby.game.id);
            }
        }).catch(function(err) {
            console.error(err);
        });
        return this.game.gameStarted;
    }

    voteStart(name) {
        if (this.votesToStart.has(name)) return false;
        this.votesToStart.add(name);
        return true;
    }

    getPercentageForStartGame() {
        return (this.votesToStart.size / this.getPlayers().length);
    }

    removePlayer(name) {
        delete this.players[name];
    }

    getPlayers() {
        return Object.keys(this.players);
    }

    getImages() {
        let images = {};
        let players = Object.values(this.players);
        for (let player of players) {
            images[player.name] = player.image;
        }
        return images;
    }

    getPlayerTeams(forFFA = this.settings.ffa) {
        let playerTeams = {};
        if (forFFA) {
            let p = this.getPlayers();
            let cc = Object.values(Team.colorCodes);
            for (let i = 0; i < p.length; i++) {
                playerTeams[p[i]] = cc[i];
            }
        } else {
            for (let p of Object.values(this.players)) {
                playerTeams[p.name] = p.team.getColor();
            }
        }
        return playerTeams;
    }

    getSockets() {
        let socks = [];
        for (let player in Object.values(this.players)) {
            socks.push(player.socket);
        }
        return socks;
    }

    alert(io, msg) {
        io.to(`${this.id}`).emit('chat-alert', msg);
    }

    endLobby() {
        for (let player in this.players) {
            try {
                this.removePlayer(player);
            } catch(err) {
                console.error(`***Error in endLobby() func:\n${err}`);
            }
        }
        if (this.game && lobbyServiceInstance.activeGames[this.game.id]) delete lobbyServiceInstance.activeGames[this.id];
        delete lobbyServiceInstance.lobbyTracker[this.id];
        delete this;
    }
}

class Player {
    constructor(name, lobbyId) {
        this.name = name;
        this.image = 'team.svg';
        this.lobbyId = lobbyId;
        this.team = null;
    }

    setSocket(socket) {
        if (typeof this.socket !== 'undefined') {
            delete lobbyServiceInstance.sockets[this.socket.id];
        }
        this.socket = socket;
        lobbyServiceInstance.registerSocket(socket, this);
    }

    setTeam(team) {
        this.team = team;
    }

    setImageToColorDefault(color) {
        this.image = color.toLowerCase() + '.png';
    }

    isValid() {
        return (typeof this.socket !== 'undefined' && typeof this.name !== 'undefined' && typeof this.lobbyId !== 'undefined');
    }
}

class LobbyService {
    constructor() {
        this.lobbyTracker = {};
        this.privateLobbies = {};
        this.refillLobbyQueue = [];
        this.sockets = {};
        this.createNewLobby();
        this.activeGames = {};
    }

    getPrivateLobby(password) {
        if (this.privateLobbies.hasOwnProperty(password)) {
            return this.privateLobbies[password];
        } else {
            let lobby = new Lobby(password);
            this.lobbyTracker[lobby.id] = lobby;
            this.privateLobbies[password] = lobby;
            return lobby;
        }
    }

    createNewLobby() {
        this.activeLobby = new Lobby();
        this.lobbyTracker[this.activeLobby.id] = this.activeLobby;
    }

    registerSocket(sock, player) {
        console.log(`connecting sock# ${sock.id} for ${player.name}`);
        this.sockets[sock.id] = player;
    }

    addPlayer(name) {
        let ret = this.activeLobby.addPlayer(name);
        if (ret === 'full') {
            this.refillOrCreateLobby();
            let ret = this.activeLobby.addPlayer(name);
        }
        return ret;
    }

    removePlayer(name, lobbyId) {
        let lobby = this.lobbyTracker[lobbyId];

        if (lobby.players.length === MAX_PLAYERS)
            this.refillLobbyQueue.push(lobby);

        lobby.removePlayer(name);
    }

    getPlayerFromActiveLobby(name) {
        return this.activeLobby.players[name];
    }

    refillOrCreateLobby() {
        if (this.refillLobbyQueue.length > 0)
            this.activeLobby = this.refillLobbyQueue.shift();
        else
            this.createNewLobby();
    }

    static getInstance() {
        return lobbyServiceInstance;
    }

    getLobbyId() {
        return this.activeLobby.id;
    }

    getLobbyIdFor(sock) {
        return this.sockets[sock.id].lobbyId;
    }

    getLobbyFor(sock) {
        return this.lobbyTracker[this.getLobbyIdFor(sock)];
    }

    getPlayers() {
        return this.activeLobby.getPlayers();
    }

    getPlayersFrom(lobbyId) {
        return this.lobbyTracker[lobbyId].getPlayers();
    }
}

const lobbyServiceInstance = new LobbyService();

module.exports = lobbyServiceInstance;

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}