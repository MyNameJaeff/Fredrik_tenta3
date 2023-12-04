// Defines everything that is required for it to work
const { PrismaClient } = require("@prisma/client");
const express = require("express");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const fileUpload = require("express-fileupload");

var sessions = require("express-session");
var cookieParser = require("cookie-parser");

// Creates a server and a socket.io connection
const prisma = new PrismaClient();
const app = express();
const server = createServer(app);
const io = new Server(server);

const oneDay = 1000 * 60 * 60 * 24;

//session middleware
app.use(
  sessions({
    secret: "thisismysecrctekeyfhrgfgrfrty84fwir767",
    saveUninitialized: true,
    cookie: { maxAge: oneDay },
    resave: false,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//serving public file
app.use(express.static(__dirname));
app.use(cookieParser());

// a variable to save a session
var session;

const create_user = async (data) => {
  await prisma.user_account.create(data);
};

const create_post = async (data) => {
  await prisma.blog_post.create(data);
};

const show = async () => {
  await prisma.blog_post.findMany().then((data) => {
    io.emit("gotAll", data);
  });
};

// Forces it to use fileupload and changes all files path from inside userStuff and upload to the main to not have to send every file though express
app.use(fileUpload());
app.use(express.static("client"));
app.use(express.static(__dirname + "/uploads"));

io.on("connection", (socket) => {
  socket.on("showAll", async () => {
    show();
  });
  socket.on("test", (data) => {
    console.log(data);
  });
});

app.get("/createUser", (req, res) => {
  session = req.session;
  if (session.userid) {
    res.sendFile(join(__dirname, `/client/loggedInUser.html`));
  } else {
    res.sendFile(join(__dirname, `/client/index.html`));
  }
});

app.get("/loginUser", (req, res) => {
  res.sendFile(join(__dirname, "/client/login.html"));
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/createUser");
});

app.get("/create", (req, res) => {
  if (session != undefined) {
    if (session.usertype == "admin") {
      res.sendFile(join(__dirname, "/client/create_posts.html"));
    } else {
      res.redirect("/loginUser");
    }
  } else {
    res.redirect("/loginUser");
  }
});

app.get("/view", (req, res) => {
    console.log(session);
  if (session != undefined) {
    if (session.usertype == "user" || session.usertype == "admin") {
      res.sendFile(join(__dirname, "/client/view_posts.html"));
    } else {
      res.redirect("/login.html");
    }
  } else {
    res.redirect("/login.html");
  }
});

app.post("/loginUser", async (req, res) => {
  session = req.session;
  try {
    const tryuser = await prisma.user_account.findUnique({
      where: {
        username: req.body.username,
      },
    });
    if (tryuser) {
        if(tryuser.password === bcrypt.hashSync(req.body.password, tryuser.password)){
            session.userid = tryuser.username;
            session.usertype = tryuser.role;
            res.redirect("/createUser");      
        }else{
            console.log("Wrong password");
            res.redirect("/loginUser");
        }
    } else {
      console.log("User not found");
      res.redirect("/loginUser");
    }
  } catch (error) {
    console.log(error);
    res.redirect("/loginUser");
  }
});

app.post("/createUser", async (req, res) => {
  console.log("Posted");
  if (req.body != null && (req.body.password === req.body.passwordCheck)) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(req.body.password, salt);
    const user = {
      data: {
        username: req.body.username,
        password: hash,
        role: req.body.role,
      },
    };

    session = req.session;
    session.userid = req.body.username;
    session.usertype = req.body.role;

    create_user(user)
      .then(async () => {
        await prisma.$disconnect();
      })
      .catch(async (e) => {
        console.error(e);
        if (e.code === "P2002") {
          console.log("Username already exists!");
        }
        await prisma.$disconnect();
        //process.exit(1);
      });
    if (req.body.role == "user") {
      res.redirect("/view_posts.html");
    } else {
      res.redirect("/create_posts.html");
    }
    console.log(req.body);
  }else{
    res.redirect("/createUser");
    /* io.emit("error", "Passwords are not the same!");  DOES NOT WANT TO DO IT!!!*/
    console.log("Some error occured! / Not same password!");
  }
});

app.post("/create", (req, res) => {
  const data = {
    data: {
      title: req.body.title,
      description: req.body.description,
      image: req.files.image.name,
    },
  };
  console.log(req.body, req.files);
  create_post(data);
  req.files.image.mv(__dirname + "/uploads/" + req.files.image.name);

  res.redirect("/view");
});

server.listen(3000, () => {
  console.log("Server is listening at port 3000");
});
