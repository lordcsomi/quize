// express server with socket.io
const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const path = require("path");
const os = require('os');

// global variables
let version = '0.2.0';
let environment = 'development';
let host = 'localhost';
let port = 8080;

// questions
let questions = [
    { 
    question: 'What is the capital of France?',
    options: ['Paris', 'London', 'Berlin', 'Madrid'],
    correct: 0,
    time : 10
    },
    {
    question: 'What is the capital of Spain?',
    options: ['Paris', 'London', 'Berlin', 'Madrid'],
    correct: 3,
    time : 10

    },
    {
    question: 'What is the capital of Germany?',
    options: ['Paris', 'London', 'Berlin', 'Madrid'],
    correct: 2,
    time : 10
    },
];
let currentQuestion = 0;

let users = {}; // socket.id -> username, answers, score
let players = []; // array of names of players
let expectedPlayers = 14; // number of players expected to join


// serve static files from the public directory
app.use(express.static('public'));

// if the client requests the /admin page
app.get('/admin', (req, res) => {
    const filePath = path.join(__dirname, '../admin/index.html');
    res.sendFile(filePath);
    console.log('admin page requested');
});

// start the express web server listening on 8080
server.listen(port, function () {
    const ip = Object.values(os.networkInterfaces())
      .flatMap((iface) => iface.filter((info) => info.family === 'IPv4' && !info.internal))
      .map((info) => info.address)[0];
      console.log(`Server version: ${version}`);
      console.log(`Server environment: ${environment}`);
      console.log(`Server listening on http://${host}:${port}`);
      console.log(`Server listening on http://${ip}:8080`);
  });

// socket.io server listens to our app
io.on('connection', (socket) => {
    console.log('user connected');

    socket.on('name', (name) => {
        // check if the name is valid
        if (name.length < 1) {
            socket.emit('alert', 'Please enter a name.');
            return;
        } if (name.length > 15) {
            socket.emit('alert', 'Please enter a shorter name.');
            return;
        };

        // check if the name is already taken
        for (let i = 0; i < players.length; i++) {
            if (players[i] == name) {
                socket.emit('alert', 'That name is already taken.');
                return;
            };
        };

        // add the player to the list of players
        players.push(name);

        // add the player to the list of users
        users[socket.id] = {
            name: name,
            socket: socket.id,
            answers: [],
            score: [],
            state : 'waiting',
        };

        // send the player to the next screen
        socket.emit('page', 'waiting'); 

        // send the player the expected number of players
        socket.emit('expectedPlayers', expectedPlayers);

        // emit the list of players to all clients
        io.emit('players', players);


        console.log('new player: ' + name);
    });


    socket.on('disconnect', () => {
        // check if the client is in the users dictionary
        if (socket.id in users) {
            socket.broadcast.emit('player left', users[socket.id].name);
            console.log('user disconnected: ' + users[socket.id].name);

            // remove the player from the list of players
            for (let i = 0; i < players.length; i++) {
                if (players[i] == users[socket.id].name) {
                    players.splice(i, 1);
                };
            };

            // remove the player from the list of users
            delete users[socket.id];

            // emit the list of players to all clients
            io.emit('players', players);
        }
    });

    // admin page
    socket.on('setExpectedPlayers', (value) => {
        expectedPlayers = value;
        console.log('expected players: ' + expectedPlayers);
        io.emit('expectedPlayers', expectedPlayers);
    });

    socket.on('startQuiz', () => {
        console.log('starting quiz');

        // for every user if the user state is waiting
        for (let user in users) {
            if (users[user].state == 'waiting') {

                // send the user to the question page
                io.to(users[user].socket).emit('page', 'question');

                // set the user state to question
                users[user].state = 'question';
            }
        }    
        quiz();   
    });

    /*socket.on('stop', () => {
        // restart server
        console.log('stopping server');
        process.exit();
    }); */
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
  
async function quiz() {
    // Loop through the questions
    for (let i = 0; i < questions.length; i++) {
        const currentQuestion = questions[i].question;
        const currentOptions = questions[i].options;
        const correctAnswer = questions[i].correct;
        const timeLimit = questions[i].time;

        console.log('\n');
        console.log('question: ' + currentQuestion);
        console.log('options: ' + currentOptions);
        console.log('correct: ' + correctAnswer);
        console.log('time: ' + timeLimit);

        // Send the question to all users in the "question" state
        for (const user in users) {
            if (users[user].state === 'question') {
                io.to(users[user].socket).emit('question', currentQuestion, currentOptions);
                console.log('question sent to ' + users[user].name);
            }
        }

        // Wait for all users to submit their answers or until the time limit is reached
        const answersPromise = new Promise((resolve) => {
            let answeredCount = 0;

            const checkAnswers = setInterval(() => {
            let allAnswered = true;

            // Check if all users have submitted their answers
            for (const user in users) {
                if (users[user].state === 'question' && users[user].answers.length < i + 1) {
                    allAnswered = false;
                    break;
                }
            }

            // If all users have answered or the time limit is reached, resolve the promise
            if (allAnswered || answeredCount >= timeLimit) {
              clearInterval(checkAnswers);
              resolve();
            }

            answeredCount++;
          }, 1000);
        });

        // Wait for the promise to resolve or until the time limit is reached
        await Promise.race([answersPromise, sleep(timeLimit * 1000)]);
    }
  
    // End the quiz and show the results
    end();
}

function end() { // End the quiz and show the results
    console.log('ending quiz');
};
