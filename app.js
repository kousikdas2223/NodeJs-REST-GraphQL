const express = require('express');

const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { graphqlHTTP } = require('express-graphql')
const graphqlSchema = require('./graphql/schema');
const graphqlResolver = require('./graphql/resolvers');
const auth = require('./middleware/auth');
const { clearImage } = require('./util/file');

const app = express();

//app.use(bodyParser.urlencoded()); // x-www-form-urlencoded for the forms in the views

const fileStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'images');
    },
    filename: function (req, file, cb) {
        cb(null, uuidv4())
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/png' ||
        file.mimetype === 'image/jpg' ||
        file.mimetype === 'image/jpeg'
    ) {
        cb(null, true);
    } else {
        cb(null, false);
    }
}

app.use(bodyParser.json()) // For REST APIs applicatio/json

app.use(multer({
    storage: fileStorage, fileFilter: fileFilter
}).single('image'));

app.use('/images', express.static(path.join(__dirname, 'images')));

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
        'Access-Control-Allow-Methods',
        'OPTIONS, GET, POST, PUT, PATCH, DELETE'
    );
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(auth);

app.put('/post-image', (req, res, next) => {
    if (!req.isAuth) {
        const error = new Error('Not authenticated!');
        throw error;
    }    
    if (!req.file) {
        return res.status(200).json({ message: 'No image is uploaded!' });
    }
    if(req.body.oldPath) {
        clearImage(req.body.oldPath);
    }
    return res.status(201).json({ message: 'No image is uploaded!', filePath: req.file.path.replace("\\", "/") });

})


app.use(
    '/graphql',
    graphqlHTTP({
        schema: graphqlSchema,
        rootValue: graphqlResolver,
        graphiql: true,
        formatError(err) {
            if (!err.originalError) {
                return err;
            }
            const data = err.originalError.data;
            const message = err.message || 'An error occurred.';
            const code = err.originalError.code || 500;
            return { message: message, status: code, data: data };
        }
    })
);

app.use((error, req, res, next) => {
    console.log(error);
    const status = error.statusCode || 500;
    const message = error.message;
    const data = error.data;
    res.status(status).json({ message: message, data: data });
});

mongoose.connect('mongodb+srv://daskousik2223:dk338142@cluster0.jxx4h.mongodb.net/messages')
    .then(result => {
        app.listen(8080);
    })
    .catch(err => {
        console.log(err);
    });



