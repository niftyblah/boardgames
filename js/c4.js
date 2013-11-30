var iioMan;
var clip;

var IO = {
	init: function() {
		IO.socket = io.connect();
		IO.bindEvents();
	},

	bindEvents: function() {
		IO.socket.on('connected', IO.onConnected);
		IO.socket.on('newGameCreated', IO.onNewGameCreated);
		IO.socket.on('playerJoinedRoom', IO.onPlayerJoined);
		IO.socket.on('beginNewGame', IO.onBeginNewGame);
		IO.socket.on('newMove', IO.onNewMove);
		IO.socket.on('gameOver', IO.onGameOver);
		IO.socket.on('error', IO.error);
		IO.socket.on('dc', IO.onDisconnection);
		IO.socket.on('batman', IO.onReply);
	},

	onReply: function() {
		$('#modal-text').text("Other player wants a rematch, do you?");
		$('#modal-confirm').show();
		$('#batman').modal();
	},

	onDisconnection: function() {
		console.log('disconnection');

		if(iioMan) iioMan.rmvAll();
		iio.stop(ConnectFour);

		$("#canvas").addClass("hidden");
		$('#replay').addClass('hidden');
		$('#text').text("other player left :(");
		$('#text').removeClass('green');
		$('#text').removeClass('red');
		$('input').val('');
		$('#setup').show();
		IO.socket.emit('unsubscribe', App.gameId);
	},

	onConnected: function() {
		//console.log('connected');
		App.mySocketId = IO.socket.socket.sessionid;
	},

	onNewGameCreated: function(data) {
		//console.log('new game created');
		App.Host.gameInit(data);
	},

	onPlayerJoined: function(data) {
		//console.log('player joined');
		App[App.myRole].updateWaitingScreen(data);
	},

	onBeginNewGame: function(turn) {
		//console.log('begin new game');

		App.updateTurn(turn);

		if(iioMan) {
			iioMan.rmvAll();
			iio.stop(ConnectFour);
		}

		$('#copy').addClass('hidden');
		$("#canvas").removeClass("hidden");
		$('#replay').addClass('hidden');
		iio.start(ConnectFour, 'canvas');
	},

	onNewMove: function(data) {
		console.log('new move');

		App.updateTurn(data.turn);

		App.drawMove(data);
	},

	onGameOver: function(data) {
		console.log('game over');

		if(data.type === 'win') {
			$('#replay').removeClass('hidden');
			App.updateTurn(data.winner);
			App.drawWinLine(App.grid.getCellCenter(data.sx, data.sy), App.grid.getCellCenter(data.ex, data.ey));
			if(data.winner === App.mySocketId)
				$('#text').text("you win :)");
			else
				$('#text').text("you lose :(");
		} else if(data.type === 'draw')
			$('#text').text('you draw :|');
	},

	error: function(data) {
		if(!data  || data.message === undefined) { data = {}; data.message = "Something broked :("; }

		//alert(data.message);
		$('#modal-text').text(data.message);
		$('#modal-confirm').hide();
		$('#batman').modal();

		if(data.type === "room_dne" || data.type === "room_full")
			$('#setup').show();
	}
};

var App = {
	gameId: '',
	myRole: '', // player / host
	mySocketId: '',
	currentRound: 0,
	myTurn: false,
	grid: {},
	hostSocketId: '',
	lastMove: null,

	init: function() {
		App.cacheElements();
		App.bindEvents();
	},

	cacheElements: function() {
		//jquery element shortcuts
		App.$doc = $(document);
	},

	bindEvents: function() {
		App.$doc.on('click', '#btnCreateGame', App.Host.onCreateClick);
		App.$doc.on('click', '#btnJoinGame', App.Player.onJoinClick);
		App.$doc.on('click', '#canvas', App.makeMove);
		App.$doc.on('click', '#replay', App.requestReplay);
		App.$doc.on('keypress', '#inputGameId', function(e) {
			if(e.which === 13) App.Player.onJoinClick();
		});
		App.$doc.on('click', '#modal-confirm', function(e) {
			IO.socket.emit('newGame');
		});
	},

	requestReplay: function() {
		$('#text').removeClass('red');
		$('#text').removeClass('green');
		IO.socket.emit('requestReplay');
	},

	drawWinLine: function(s, e) {
		var line = new iio.Line(s,e);
		line.setStrokeStyle('#2C3E50');
		line.setLineWidth(5);
		iioMan.addObj(line);
	},

	drawMove: function(data) {
		var host = '#9B59B6',
			player = '#34495E';

		var gridPoint = App.grid.getCellCenter(data.x, data.y);
		var piece = new iio.Circle(gridPoint, 32);

		if(App.lastMove) { iioMan.rmvObj(App.lastMove); }
		App.lastMove = new iio.Rect(gridPoint, 80, 80);
		App.lastMove.setLineWidth(3);

		if(data.id === App.hostSocketId) {
			piece.setFillStyle(host);
			App.lastMove.setStrokeStyle(host);
		} else {
			piece.setFillStyle(player);
			App.lastMove.setStrokeStyle(player);
		}

		iioMan.addObj(piece);
		iioMan.addObj(App.lastMove);
	},

	updateTurn: function(turnId) {
		var $turn = $('#text');

		if(turnId === App.mySocketId) { //it's my turn
			$turn.text("go");
			$turn.removeClass("red");
			$turn.addClass("green");
			App.myTurn = true;
		} else { //it's the other guys turn
			$turn.text("wait");
			$turn.removeClass("green");
			$turn.addClass("red");
			App.myTurn = false;
		}
	},

	makeMove: function(event) {
		var point = iioMan.getEventPosition(event);
		var gridPoint = App.grid.getCellAt(point);

		//console.log(gridPoint);
		gridPoint.gameId = App.gameId;

		if(App.myTurn) IO.socket.emit('playerMove', gridPoint);
	},

	Host: {
		players: [],
		numPlayersInRoom: 0,

		onCreateClick: function() {
			IO.socket.emit('hostCreateNewGame');
			$('#setup').hide();

			
		},

		gameInit: function(data) {
			App.gameId = data.gameId;
			App.mySocketId = data.mySocketId;
			App.myRole = 'Host';
			App.Host.numPlayersInRoom = 1;
			App.hostSocketId = data.mySocketId;

			console.log("Game started with ID: " + App.gameId + " by host: " + App.mySocketId);
			App.Host.displayNewGameScreen();
		},

		displayNewGameScreen: function() {
			$('#text').text(App.gameId);
			$('#copy').removeClass('hidden');
		},

		updateWaitingScreen: function(data) {
			App.Host.players.push(data);

			IO.socket.emit('hostRoomFull', App.gameId);
		}
	},

	Player: {
		onJoinClick: function() {
			var data = {
				gameId: $('#inputGameId').val()
			};

			IO.socket.emit('playerJoinGame', data);

			App.myRole = 'Player';

			$('#setup').hide();
		},

		updateWaitingScreen: function(data) {
			console.log(IO.socket);
			if(IO.socket.socket.sessionid === data.mySocketId) {
				App.myRole = 'Player';
				App.gameId = data.gameId;
				App.hostSocketId = data.host;

				//$('#gameid').text(App.gameId);
				//$('#me').text("I am the " + App.myRole + ": " + App.mySocketId);
				//$('#other').text('Other guy is the host: ' + data.host);
			}
		}
	}
};

IO.init();
App.init();

function ConnectFour(iioAppManager) {
	iioMan = iioAppManager;
	iioMan.setFramerate(60, function() {
		//stuff
	});

	App.grid = new iio.Grid(0,0, 7, 6, 80, 80);
	App.grid.setStrokeStyle('#2C3E50');
	iioMan.addObj(App.grid);
}

// load zero clip when page is ready rather than when create is clicked, sometimes
// has a delay in working so this just cuts that out at a cost to the 'player'
$(function() {
	clip = new ZeroClipboard($("#copy"), { moviePath: "js/ZeroClipboard.swf" });
	clip.on('mousedown', function() {
		$('#text').addClass('green');
	});
});