import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";

dotenv.config();

const app = express();
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect(() => {
  db = mongoClient.db("batepapouol");
});

app.use(cors());
app.use(json());

app.post("/participants", async (req, res) => {
  try {
    const uol = mongoClient.db("batepapouol");
    const participants = uol.collection("participants");
    const messages = uol.collection("messages");

    const online = await participants.find({}).toArray();

    let participantsList = online.map((el) => el.name);

    const username = req.body;
    const userSchema = joi.object().keys({
      name: joi
        .string()
        .invalid(...participantsList)
        .required(),
    });

    const validation = userSchema.validate(username, { abortEarly: true });

    if (validation.error) {
      if (validation.error.details[0].type === "any.invalid") {
        res.status(409).send("Nome de usuário já existe");
      } else {
        res.status(422).send("Favor inserir um nome");
      }
      return;
    }

    username.lastStatus = Date.now();
    await participants.insertOne(username);

    let StatusMsg = {
      from: username.name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs(username.lastStatus).format("HH:mm:ss"),
    };
    await messages.insertOne(StatusMsg);

    res.sendStatus(201);
  } catch {
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const uol = mongoClient.db("batepapouol");
    const participants = uol.collection("participants");
    let online = [];
    online = await participants.find({}).toArray();
    res.send(online);
  } catch {
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.valid("message", "private_message"),
  });
  const validation = messageSchema.validate(req.body);

  if (validation.error) {
    res.status(422).send(
      validation.error.details.map((erro) => {
        erro.message;
      })
    );
    return;
  }

  try {
    const username = req.header("User");

    const uol = mongoClient.db("batepapouol");
    const participants = uol.collection("participants");
    const messages = uol.collection("messages");
    const validate = participants.find({ name: username });

    if (validate) {
      await messages.insertOne({
        from: username,
        to: req.body.to,
        text: req.body.text,
        type: req.body.type,
        time: dayjs().format("HH:mm:ss"),
      });
      res.sendStatus(201);
    } else {
      res.status(422).send("Envie um formato válido");
    }
  } catch (error) {
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit);
  const username = req.headers.user;

  try {
    const uol = mongoClient.db("batepapouol");
    const messages = uol.collection("messages");
    const chat = await messages.find({}).toArray();

    const userMsgs = chat.filter(
      (msg) =>
        msg.to === username || msg.from === username || msg.to === "Todos"
    );
    if (!limit) {
      res.send(userMsgs);
    } else {
      if (limit > userMsgs.length) {
        res.send(userMsgs);
        return;
      } else {
        const selecteds = [...userMsgs].reverse().slice(0, limit);
        res.send(selecteds.reverse());
      }
    }
  } catch (error) {
    res.sendStatus(500);
  }
});

app.post("/status", async (req, res) => {
  try {
    const username = req.header("User");

    const uol = mongoClient.db("batepapouol");
    const participants = uol.collection("participants");
    const validate = await participants.findOne({ name: username });

    if (validate) {
      await participants.updateOne(
        { _id: validate._id },
        { $set: { lastStatus: Date.now() } }
      );
      res.sendStatus(200);
    } else {
      res.sendStatus(404);

      return;
    }
  } catch (error) {
    res.sendStatus(500);
  }
});

setInterval(async () => {
  try {
    const uol = mongoClient.db("batepapouol");
    const participants = uol.collection("participants");
    const messages = uol.collection("messages");
    const online = await participants.find({}).toArray();

    for (const participant of online) {
      if (Date.now() - participant.lastStatus > 10000) {
        await participants.deleteOne({ name: participant.name });
        await messages.insertOne({
          from: participant.name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: dayjs().format("HH:mm:ss"),
        });
      }
    }
  } catch (error) {
    console.log(error);
  }
}, 15000);

app.listen(5000, () => {
  console.log("Rodando em http://localhost:5000");
});
