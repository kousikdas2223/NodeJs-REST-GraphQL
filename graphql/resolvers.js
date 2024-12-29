
const validator = require('validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/user');
const Post = require('../models/post');
const { clearImage } = require('../util/file')

module.exports = {
    createUser: async function ({ userInput }, req) {
        //Either we can get the value in say createUser(args, req) and then
        //retrieve the values as const email = args.userInput.email
        //or else we can use the destructuring { userInput }
        //we can using async or we can use the then catch block as well
        //If not using async await then we have to write it like
        //return User.findOne({ email: userInput.email }) and use then() and catch()

        const errors = [];

        if (!validator.isEmail(userInput.email)) {
            errors.push({ message: 'Email is invalid' });
        }
        if (!validator.isLength(userInput.password, { min: 5 }) || validator.isEmpty(userInput.password)) {
            errors.push({ message: 'Password must be at least 6 characters' });
        }
        if (errors.length > 0) {
            const error = new Error('Invalid input values');
            error.data = errors;
            error.code = 422;
            throw error;
        }
        const existingUser = await User.findOne({ email: userInput.email });
        if (existingUser) {
            const error = new Error('User already exists');
            throw error;
        }

        const hashedPassword = await bcrypt.hash(userInput.password, 12);

        const user = new User({
            email: userInput.email,
            password: hashedPassword,
            name: userInput.name
        });

        const createdUser = await user.save();

        return { ...createdUser._doc, _id: createdUser._id.toString() };
    },

    login: async function ({ email, password }) {
        const user = await User.findOne({ email: email });

        if (!user) {
            const error = new Error('User not found');
            error.code = 401;
            throw error;
        }

        const isEqual = await bcrypt.compare(password, user.password);

        if (!isEqual) {
            const error = new Error('Invalid email or password');
            error.code = 401;
            throw error;
        }

        const token = jwt.sign({
            userId: user._id.toString(),
            email: user.email
        },
            'somesupersecrettoken',
            {
                expiresIn: '1h'
            }
        );
        return { token: token, userId: user._id.toString() };
    },
    createPost: async function ({ postInput }, req) {
        if (!req.isAuth) {
            const error = new Error('User is not authenticated');
            error.code = 401;
            throw error;
        }
        const errors = [];
        if (validator.isEmpty(postInput.title) ||
            !validator.isLength(postInput.title, { min: 6 })) {
            errors.push('Title must be atleast 6 characters in length')
        }
        if (validator.isEmpty(postInput.content) ||
            !validator.isLength(postInput.content, { min: 6 })) {
            errors.push('Content must be atleast 6 characters in length')
        }
        if (errors.length > 0) {
            const error = new Error('Invalid input values');
            error.data = errors;
            error.code = 422;
            throw error;
        }

        const user = await User.findById(req.userId);

        if (!user) {
            const error = new Error('User do not exist');
            error.code = 401;
            throw error;
        }

        const post = new Post({
            title: postInput.title,
            content: postInput.content,
            imageUrl: postInput.imageUrl,
            creator: user
        });

        const createdPost = await post.save();
        user.posts.push(createdPost);
        await user.save();

        return {
            ...createdPost._doc,
            _id: createdPost._id.toString(),
            createdAt: createdPost.createdAt.toISOString(),
            updatedAt: createdPost.updatedAt.toISOString()
        };

    },
    posts: async function ({ page }, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        if (!page) {
            page = 1;
        }
        const perPage = 2;
        const totalPosts = await Post.find().countDocuments();
        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .skip((page - 1) * perPage)
            .limit(perPage)
            .populate('creator');
        return {
            posts: posts.map(p => {
                return {
                    ...p._doc,
                    _id: p._id.toString(),
                    createdAt: p.createdAt.toISOString(),
                    updatedAt: p.updatedAt.toISOString()
                };
            }),
            totalPosts: totalPosts
        };
    },
    post: async function ({ id }, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }

        const post = await Post.findById(id).populate('creator');

        if (!post) {
            const error = new Error('No post found!');
            error.code = 404;
            throw error;
        }

        return {
            ...post._doc,
            id: post._id.toString(),
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString()
        }
    },
    updatePost: async function ({ id, postInput }, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        const post = await Post.findById(id).populate('creator');
        if (!post) {
            const error = new Error('No post found!');
            error.code = 404;
            throw error;
        }
        if (post.creator._id.toString() !== req.userId.toString()) {
            const error = new Error('Not authorized to edit the post!');
            error.code = 403;
            throw error;
        }
        const errors = [];
        if (
            validator.isEmpty(postInput.title) ||
            !validator.isLength(postInput.title, { min: 5 })
          ) {
            errors.push({ message: 'Title is invalid.' });
          }
          if (
            validator.isEmpty(postInput.content) ||
            !validator.isLength(postInput.content, { min: 5 })
          ) {
            errors.push({ message: 'Content is invalid.' });
          }
        if (errors.length > 0) {
            const error = new Error('Invalid input values');
            error.data = errors;
            error.code = 422;
            throw error;
        }
        post.title = postInput.title;
        post.content = postInput.content;
        if (postInput.imageUrl !== 'undefined') {
            post.imageUrl = postInput.imageUrl;
        }
        const updatedPost = await post.save();
        return {
            ...updatedPost._doc,
            _id: updatedPost._id.toString(),
            createdAt: updatedPost.createdAt.toISOString(),
            updatedAt: updatedPost.updatedAt.toISOString()
        };
    },

    deletePost: async function ({ id }, req) {
        if (!req.isAuth) {
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }

        const post = await Post.findById(id);

        if (!post) {
            const error = new Error('No post found!');
            error.code = 404;
            throw error;
        }

        if (post.creator.toString() !== req.userId.toString()) {
            const error = new Error('Not authorized to edit the post!');
            error.code = 403;
            throw error;
        }
        clearImage(post.imageUrl);
        await Post.findByIdAndDelete(id);
        const user = await User.findById(req.userId);
        user.posts.pull(id);
        await user.save();
        return true;

    },
    user: async function(args, req){
        if (!req.isAuth) {
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        const user = await User.findById(req.userId);
        if (!user) {
            const error = new Error('No user found!');
            error.code = 404;
            throw error;
        }
        return { ...user._doc, _id: user._id.toString() };
    },
    updateStatus: async function({status}, req){
        if (!req.isAuth) {
            const error = new Error('Not authenticated!');
            error.code = 401;
            throw error;
        }
        const user = await User.findById(req.userId);
        if (!user) {
            const error = new Error('No user found!');
            error.code = 404;
            throw error;
        }
        user.status = status;
        await user.save();
        return { ...user._doc, _id: user._id.toString() };
    }
};