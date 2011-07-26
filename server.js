
var express =  require('express'),
    app = express.createServer(),
    io = require('socket.io').listen(app),
    fs = require('fs'),
    mime = require('mime'),
    redis = require('redis');

var db = redis.createClient();

db.on("error", function(err) {
	console.log("redis Error"+ err);
});
// debug check redis-client version info
db.info(function(err, info) {
    console.log("redis-client call-back");
    if(err) throw new Error(err);
    console.log("Redis Version is:" +info);
});

app.listen(8001);
app.get('/',function(req,res){
    var realpath = __dirname + '/client.html';
    console.log(realpath);
    res.writeHead(200,{'Content-Type':mime.lookup(realpath)});
    res.end(fs.readFileSync(realpath));
});
app.get('/jquery.min.js',function(req,res){
    var realpath = __dirname + '/jquery.min.js';
    console.log(realpath);
    res.writeHead(200,{'Content-Type':mime.lookup(realpath)});
    res.end(fs.readFileSync(realpath));
});
var getCurrTime = function(){
    var d  = new Date();
    return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate()+' '+d.getHours()+':'+d.getMinutes()+':'+d.getSeconds();
};
var getRoomID = function(){
    var d  = new Date();
    return d.getFullYear()+(d.getMonth()+1)+d.getDate()+d.getHours()+d.getMinutes()+d.getSeconds();
};
io.sockets.on('connection', function (socket) {
 	socket.on('msg', function(msg){
	  	var data = {username:socket.username,time:getCurrTime(),msg:msg};
  		socket.emit('msg',data);
  		socket.broadcast.emit('msg',data);
 	});
 	var redisClient = redis.createClient();
 	socket.on('login', function(dataLogin){
		console.log("begin user login");
		console.dir(dataLogin);
		socket.pfid = dataLogin.pfid;
		socket.username = dataLogin.username;
		db.hset(dataLogin.pfid+"-stats", "pfid", dataLogin.pfid);
		db.hset(dataLogin.pfid+"-stats", "username", dataLogin.username);
		db.hset(dataLogin.pfid+"-stats", "atime", getCurrTime());
		db.hset(dataLogin.pfid+"-stats", "stats", "online");
		// begin receive friends call， 如果有人呼叫的时候
		redisClient.publish(dataLogin.pfid + "-stats", JSON.stringify(dataLogin));
		redisClient.subscribe(dataLogin.pfid + "-recep");
		var data = {username:'SYSTEM',time:getCurrTime(),msg:'welcome '+socket.username+' in...'};
		socket.broadcast.emit('msg',data);
		socket.emit('msg',data);
	});
 	redisClient.on("message", function(channel, data) {
 		console.log("redisClient on message channel=" + channel + ', data=' + data);
 		var pos = channel.indexOf("-recep");
 		if(pos > 0) {
 			var pfid = channel.substring(0, pos);
 			console.log(pfid + " begin new ChatRoom: ");
 			var newChatRoom = JSON.parse(data);
 			console.dir(newChatRoom);
 			socket.emit("newChatRoom", newChatRoom);
 			redisClient.subscribe(newChatRoom.rid + "-room");
 			return;
 		}
 		pos = channel.indexOf("-stats");
		if(pos > 0) {
			var pfid = channel.substring(0, pos);
			console.log("pfid=" + pfid);
			var obj = JSON.parse(data);
			console.dir(obj);
			obj.pfid = pfid;
			socket.emit('statsUpdate', obj);
			return;
		}
		pos = channel.indexOf("-room");
 		if(pos > 0) {
 			var rid = channel.substring(0, pos);
 			console.log(rid + " begin Send IM:");
			var newIM = JSON.parse(data);
			console.dir(newIM);
			socket.emit("sendMsg", newIM);
			return;
 		}
	});
	socket.on('logout', function(username){
		var data = {username:'SYSTEM',time:getCurrTime(),msg:'bye, '+socket.username+' leave...'};
		db.del(username+"-stats");
		socket.broadcast.emit('msg',data);
		socket.emit('msg',data);
	});
	socket.on('disconnect', function () {
		var username = socket.username;
		db.del(username+"-stats");
		socket.send(getCurrTime()+' '+socket.username+ " out...");
	});
	socket.on('newChatRoom', function(newChatRoom) {
		console.log("begin newChatRoom");
		console.dir(newChatRoom);
		var rid = getRoomID(); //"myfirstRoom";
		var pfid2 = newChatRoom.pfid2;
		newChatRoom.rid = rid;
		newChatRoom.from = socket.pfid;
		newChatRoom.fromUserName = socket.username;
		newChatRoom.to = pfid2;
		db.publish(pfid2 + "-recep", JSON.stringify(newChatRoom));
		db.publish(newChatRoom.from + "-recep", JSON.stringify(newChatRoom));
	});
	socket.on('inquireContacts', function(contacts) {
		// inquire the contacts the status and subscribe the updates
		for(var i=0; i<contacts.length; i++) {
			var pfid = contacts[i];
			console.log('inquireContacts pfid=' + pfid);
			db.hgetall(pfid + '-stats', function(err, obj) {
				console.log("get statsUpdate");
				console.dir(obj);
				socket.emit('statsUpdate', obj);
			});
			redisClient.subscribe(pfid + '-stats');
		}
	});
	socket.on('sendMsg', function(sendNewIM) {
		console.log("socket on sendMsg");
		console.dir(sendNewIM)
		var rid = sendNewIM.rid;
		db.publish(rid + "-room", JSON.stringify(sendNewIM));   
	});
});


