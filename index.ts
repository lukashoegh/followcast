import * as readlineSync from 'readline-sync';
import * as http from 'https';
import * as _ from 'lodash';
import * as Nedb from 'nedb';
import * as querystring from 'querystring';
import * as readline from 'readline';

const apiKey = 'b956300e2b9c4f84934db44e19aec3ba';
const db = new Nedb('data.db');
db.loadDatabase((error) => {
  if (error) {
    console.log(`A database error occured: ${error}`);
    console.log('If the problem persists, try deleting data.db');
  }
  else {
    isAutocheckingEnabled((enabled) => {
      enabled ?
        checkForNewCredits() :
        requestMainMenuInput();
    });
  }
});

const mainMenuOptions = {
  hideEchoBack: true,
  mask: '',
  limit: 'fcqrla',
};
let autochecking = false;

function getMainMenuStrings() {
  return [
    '(f)ind person',
    '(c)heck for new credits',
    '(r)emove person',
    '(l)ist people',
    (autochecking)? 'disable (a)utochecking' : 'enable (a)utochecking',
    '(q)uit'
  ];
}

function requestMainMenuInput() {
  console.log('Choose an option:')
  console.log(_.join(getMainMenuStrings(), ', '));
  let c = readlineSync.keyIn('', mainMenuOptions);
  handleMainMenuInput(c);
}


function handleMainMenuInput(c: string) {
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
  console.log('Find person.')
  let answer = readlineSync.question('name: ')
  handleFindPersonInput(answer);
}

function handleFindPersonInput(name: string) {
  console.log('Finding person ' + name);
  let options = {
    method: 'GET',
    hostname: 'api.themoviedb.org',
    port: null,
    path: `/3/search/person?include_adult=false&page=1&query=${querystring.escape(name)}&language=en-US&api_key=${apiKey}`,
    headers: {}
  };
  let req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      var body = Buffer.concat(chunks);
      let results = _.map(JSON.parse(body.toString()).results, parseSearchResults);
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

const FindPersonConfirmationOptions = {
  hideEchoBack: true,
  mask: '',
  limit: 'anse',
}

function requestFindPersonConfirmation(results) {
  if (results.length === 0) {
    console.log('No more people to display.');
    return requestMainMenuInput();;
  }
  let first = results[0];
  results = _.slice(results, 1);
  console.log(`Did you mean ${first.name}, who is known for ${first.knownFor}?`);
  console.log('(A)dd to my list, (N)o, show the next result, (S)earch again, (E)xit to main menu');
  let answer = readlineSync.keyIn('', FindPersonConfirmationOptions);
  handleFindPersonConfirmation(answer, first, results);
}

function handleFindPersonConfirmation(c: string, person: any, results: any) {
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

function addPerson(person: any) {
  console.log(`Adding ${person.name} to your list.`);
  getCredits(person.id, (credits: any) => {
    credits = _.map(credits, parseCredit);
    db.insert({
      _id: person.id,
      name: person.name,
      credits: credits,
    });
    requestMainMenuInput();
  });

}

function getCredits(id: number, callback: (credits: any) => void) {
  let options = {
    method: 'GET',
    hostname: 'api.themoviedb.org',
    port: null,
    path: `/3/person/${id}/combined_credits?language=en-US&api_key=${apiKey}`,
    headers: {}
  };
  let req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
      chunks.push(chunk);
    });

    res.on("end", function () {
      var body = Buffer.concat(chunks);
      let results = JSON.parse(body.toString());
      let credits = _.concat(results.cast, results.crew);
      callback(credits);
    });
  });
  req.end();
}

function parseCredit(credit: any) {
  return credit.credit_id
}

function checkForNewCredits() {
  db.find({name: {$exists: true} }, (error, docs) => {
    if (docs.length === 0) {
      console.log('Your list is empty! You have to add some people before you check for new credits.');
      return requestMainMenuInput();
    }
    console.log(`Checking for credits for ${docs.length} people...`)
    checkForNewCreditsFor(docs);
  });
}

function checkForNewCreditsFor(docs: any) {
  let person = docs[0];
  docs = _.slice(docs, 1);
  clearAndReturn();
  process.stdout.write(`Checking ${person.name}`);
  getCredits(person._id, (downloadedCredits: any) => {
    let creditIds = _.map(downloadedCredits, parseCredit);
    let newCredits = _.difference(creditIds, person.credits);
    if (newCredits.length > 0) {
      clearAndReturn()
      console.log(`New credits found for ${person.name}.`);
      for (let id of newCredits) {
        let creditDetails = _.find(downloadedCredits, (credit: any) => credit.credit_id === id);
        displayCredit(creditDetails);
        db.update({ _id: person._id }, {
          $set: { credits: creditIds }
        });
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
  let date = (credit.first_air_date === undefined) ? credit.release_date : credit.first_air_date;
  if (credit.character !== undefined) {
    if (credit.character == '') {
      console.log(`Appeared in ${getTitleOrName(credit)} (on ${date}).`);
    }
    else {
      console.log(`"${credit.character}" in ${getTitleOrName(credit)} (on ${date}).`);
    }
  }
  else {
    console.log(`${credit.job} for ${getTitleOrName(credit)} (on ${date}).`);
  }
}

function requestRemovePersonInput() {
  console.log('Who do you want to remove?');
  let answer = readlineSync.question('name: ');
  handleRemovePersonInput(answer);
}

function handleRemovePersonInput(name: string) {
  db.find({ name: { $regex: new RegExp(name, "i") } }, (error, docs) => {
    if (docs.length === 0) {
      console.log('Could not find anyone with that name in your list.');
      requestMainMenuInput();
    }
    else {
      requestRemovePersonConfirmation(docs);
    }
  });
}

const removePersonConfirmationOptions = {
  hideEchoBack: true,
  mask: '',
  limit: 'rnse',
}

function requestRemovePersonConfirmation(docs) {
  if (docs.length === 0) {
    console.log('No more matching people in your list where found.');
    return requestMainMenuInput();
  }
  let first = docs[0];
  docs = _.slice(docs, 1);
  console.log(`Did you mean ${first.name}?`);
  console.log('(R)emove from my list, (N)o, show the next result, (S)earch again, (E)xit to main menu');
  let answer = readlineSync.keyIn('', removePersonConfirmationOptions);
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
  console.log(`Removed ${person.name} from your list.`);
  requestMainMenuInput();
}

function listPeople() {
  console.log('The following people are in your list:');
  db.find({ name: {$exists: true}}, (error, docs) => {
    for (let person of docs) {
      console.log(person.name);
    }
    requestMainMenuInput();
  });
}

function isAutocheckingEnabled(callback) {
  db.find({ autochecking: true }, (error, docs) => {
    autochecking = (docs.length !== 0);
    callback(autochecking);
  });
}

function toggleAutochecking() {
  db.update({ autochecking: autochecking }, { autochecking: !autochecking }, {}, (error, numReplaced) => {
    if (numReplaced === 0) {
      db.insert({ autochecking: true });
    }
    autochecking = !autochecking;
    console.log(`Autochecking has been ${autochecking? 'enabled' : 'disabled'}.`);
    requestMainMenuInput();
  });
}