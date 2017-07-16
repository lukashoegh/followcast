"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var readlineSync = require("readline-sync");
var http = require("https");
var _ = require("lodash");
var Nedb = require("nedb");
var querystring = require("querystring");
var readline = require("readline");
var apiKey = 'b956300e2b9c4f84934db44e19aec3ba';
var db = new Nedb('data.db');
db.loadDatabase(function (error) {
    if (error) {
        console.log("A database error occured: " + error);
        console.log('If the problem persists, try deleting data.db');
    }
    else {
        isAutocheckingEnabled(function (enabled) {
            enabled ?
                checkForNewCredits() :
                requestMainMenuInput();
        });
    }
});
var mainMenuOptions = {
    hideEchoBack: true,
    mask: '',
    limit: 'fcqrla',
};
var autochecking = false;
function getMainMenuStrings() {
    return [
        '(f)ind person',
        '(c)heck for new credits',
        '(r)emove person',
        '(l)ist people',
        (autochecking) ? 'disable (a)utochecking' : 'enable (a)utochecking',
        '(q)uit'
    ];
}
function requestMainMenuInput() {
    console.log('Choose an option:');
    console.log(_.join(getMainMenuStrings(), ', '));
    var c = readlineSync.keyIn('', mainMenuOptions);
    handleMainMenuInput(c);
}
function handleMainMenuInput(c) {
    switch (c) {
        case 'f':
            requestFindPersonInput();
            break;
        case 'c':
            checkForNewCredits();
            break;
        case 'r':
            requestRemovePersonInput();
            break;
        case 'l':
            listPeople();
            break;
        case 'a':
            toggleAutochecking();
            break;
        default:
            break;
    }
}
function requestFindPersonInput() {
    console.log('Find person.');
    var answer = readlineSync.question('name: ');
    handleFindPersonInput(answer);
}
function handleFindPersonInput(name) {
    console.log('Finding person ' + name);
    var options = {
        method: 'GET',
        hostname: 'api.themoviedb.org',
        port: null,
        path: "/3/search/person?include_adult=false&page=1&query=" + querystring.escape(name) + "&language=en-US&api_key=" + apiKey,
        headers: {}
    };
    var req = http.request(options, function (res) {
        var chunks = [];
        res.on("data", function (chunk) {
            chunks.push(chunk);
        });
        res.on("end", function () {
            var body = Buffer.concat(chunks);
            var results = _.map(JSON.parse(body.toString()).results, parseSearchResults);
            requestFindPersonConfirmation(results);
        });
    });
    req.end();
}
function parseSearchResults(result) {
    return {
        id: result.id,
        name: result.name,
        knownFor: _.join(_.map(result.known_for, parseKnownFor), ', '),
    };
}
function parseKnownFor(knownFor) {
    return getTitleOrName(knownFor);
}
function getTitleOrName(credit) {
    return credit.media_type === 'movie' ? credit.title : credit.name;
}
var FindPersonConfirmationOptions = {
    hideEchoBack: true,
    mask: '',
    limit: 'anse',
};
function requestFindPersonConfirmation(results) {
    if (results.length === 0) {
        console.log('No more people to display.');
        return requestMainMenuInput();
        ;
    }
    var first = results[0];
    results = _.slice(results, 1);
    console.log("Did you mean " + first.name + ", who is known for " + first.knownFor + "?");
    console.log('(A)dd to my list, (N)o, show the next result, (S)earch again, (E)xit to main menu');
    var answer = readlineSync.keyIn('', FindPersonConfirmationOptions);
    handleFindPersonConfirmation(answer, first, results);
}
function handleFindPersonConfirmation(c, person, results) {
    switch (c) {
        case 'a':
            addPerson(person);
            break;
        case 'n':
            requestFindPersonConfirmation(results);
            break;
        case 'e':
            requestMainMenuInput();
            break;
        case 's':
            requestFindPersonInput();
            break;
        default:
            break;
    }
}
function addPerson(person) {
    console.log("Adding " + person.name + " to your list.");
    getCredits(person.id, function (credits) {
        console.log('Newest credits:');
        var sortedCredits = _.slice(_.orderBy(credits, [
            function (credit) { return _.split(getDate(credit), '-')[0]; },
            function (credit) { return _.split(getDate(credit), '-')[1]; },
            function (credit) { return _.split(getDate(credit), '-')[2]; },
        ], ['desc', 'desc', 'desc']), 0, 3);
        for (var _i = 0, sortedCredits_1 = sortedCredits; _i < sortedCredits_1.length; _i++) {
            var credit = sortedCredits_1[_i];
            displayCredit(credit);
        }
        credits = _.map(credits, parseCredit);
        db.insert({
            _id: person.id,
            name: person.name,
            credits: credits,
        });
        requestMainMenuInput();
    });
}
function getCredits(id, callback) {
    var options = {
        method: 'GET',
        hostname: 'api.themoviedb.org',
        port: null,
        path: "/3/person/" + id + "/combined_credits?language=en-US&api_key=" + apiKey,
        headers: {}
    };
    var req = http.request(options, function (res) {
        var chunks = [];
        res.on("data", function (chunk) {
            chunks.push(chunk);
        });
        res.on("end", function () {
            var body = Buffer.concat(chunks);
            var results = JSON.parse(body.toString());
            var credits = _.concat(results.cast, results.crew);
            callback(credits);
        });
    });
    req.end();
}
function parseCredit(credit) {
    return credit.credit_id;
}
function checkForNewCredits() {
    db.find({ name: { $exists: true } }, function (error, docs) {
        if (docs.length === 0) {
            console.log('Your list is empty! You have to add some people before you check for new credits.');
            return requestMainMenuInput();
        }
        console.log("Checking for credits for " + docs.length + " people...");
        checkForNewCreditsFor(docs);
    });
}
function checkForNewCreditsFor(docs) {
    var person = docs[0];
    docs = _.slice(docs, 1);
    clearAndReturn();
    process.stdout.write("Checking " + person.name);
    getCredits(person._id, function (downloadedCredits) {
        var creditIds = _.map(downloadedCredits, parseCredit);
        var newCredits = _.difference(creditIds, person.credits);
        if (newCredits.length > 0) {
            clearAndReturn();
            console.log("New credits found for " + person.name + ".");
            var _loop_1 = function (id) {
                var creditDetails = _.find(downloadedCredits, function (credit) { return credit.credit_id === id; });
                displayCredit(creditDetails);
                db.update({ _id: person._id }, {
                    $set: { credits: creditIds }
                });
            };
            for (var _i = 0, newCredits_1 = newCredits; _i < newCredits_1.length; _i++) {
                var id = newCredits_1[_i];
                _loop_1(id);
            }
        }
        if (docs.length === 0) {
            clearAndReturn();
            console.log('Done checking. Returning to main menu');
            return requestMainMenuInput();
        }
        else {
            checkForNewCreditsFor(docs);
        }
    });
}
function clearAndReturn() {
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
}
function displayCredit(credit) {
    var date = getDate(credit);
    if (credit.character !== undefined) {
        if (credit.character == '') {
            console.log("Appeared in " + getTitleOrName(credit) + " (on " + date + ").");
        }
        else {
            console.log("\"" + credit.character + "\" in " + getTitleOrName(credit) + " (on " + date + ").");
        }
    }
    else {
        console.log(credit.job + " for " + getTitleOrName(credit) + " (on " + date + ").");
    }
}
function getDate(credit) {
    return (credit.first_air_date === undefined) ? credit.release_date : credit.first_air_date;
}
function requestRemovePersonInput() {
    console.log('Who do you want to remove?');
    var answer = readlineSync.question('name: ');
    handleRemovePersonInput(answer);
}
function handleRemovePersonInput(name) {
    db.find({ name: { $regex: new RegExp(name, "i") } }, function (error, docs) {
        if (docs.length === 0) {
            console.log('Could not find anyone with that name in your list.');
            requestMainMenuInput();
        }
        else {
            requestRemovePersonConfirmation(docs);
        }
    });
}
var removePersonConfirmationOptions = {
    hideEchoBack: true,
    mask: '',
    limit: 'rnse',
};
function requestRemovePersonConfirmation(docs) {
    if (docs.length === 0) {
        console.log('No more matching people in your list where found.');
        return requestMainMenuInput();
    }
    var first = docs[0];
    docs = _.slice(docs, 1);
    console.log("Did you mean " + first.name + "?");
    console.log('(R)emove from my list, (N)o, show the next result, (S)earch again, (E)xit to main menu');
    var answer = readlineSync.keyIn('', removePersonConfirmationOptions);
    handleRemovePersonConfirmation(answer, first, docs);
}
function handleRemovePersonConfirmation(answer, person, docs) {
    switch (answer) {
        case 'r':
            removePerson(person);
            break;
        case 'n':
            requestRemovePersonConfirmation(docs);
            break;
        case 's':
            requestRemovePersonInput();
            break;
        default:
            requestMainMenuInput();
    }
}
function removePerson(person) {
    db.remove({ _id: person._id });
    console.log("Removed " + person.name + " from your list.");
    requestMainMenuInput();
}
function listPeople() {
    console.log('The following people are in your list:');
    db.find({ name: { $exists: true } }, function (error, docs) {
        docs = _.sortBy(docs, [
            function (person) { return _.last(_.split(person.name, ' ')); },
            function (person) { return person.name; }
        ]);
        for (var _i = 0, docs_1 = docs; _i < docs_1.length; _i++) {
            var person = docs_1[_i];
            console.log(person.name);
        }
        requestMainMenuInput();
    });
}
function isAutocheckingEnabled(callback) {
    db.find({ autochecking: true }, function (error, docs) {
        autochecking = (docs.length !== 0);
        callback(autochecking);
    });
}
function toggleAutochecking() {
    db.update({ autochecking: autochecking }, { autochecking: !autochecking }, {}, function (error, numReplaced) {
        if (numReplaced === 0) {
            db.insert({ autochecking: true });
        }
        autochecking = !autochecking;
        console.log("Autochecking has been " + (autochecking ? 'enabled' : 'disabled') + ".");
        requestMainMenuInput();
    });
}
//# sourceMappingURL=index.js.map