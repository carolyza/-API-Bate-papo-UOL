import express, { json } from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";

dotenv.config();

const app = express();
const mongoClient = new MongoClient(process.env.MONGO_URI);

app.use(cors());
app.use(json());

app.post("/participants", async (req, res) => {
  try {
    await mongoClient.connect();
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
      mongoClient.close();
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

  mongoClient.close();
});

app.get("/participants", async (req, res) => {
  try {
    await mongoClient.connect();
    const uol = mongoClient.db("batepapouol");
    const participants = uol.collection("participants");
    let online = [];
    online = await participants.find({}).toArray();
    res.send(online);
  } catch {
    res.sendStatus(500);
  }
  mongoClient.close();
});

app.post("/messages", async (req, res) => {
  const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().allow("message", "private_message").required(),
  });
  const validation = messageSchema.validate(req.body);

  if (validation.error) {
    res.status(422).send(
      validation.error.details.map((erro) => {
        erro.message;
      })
    );
    mongoClient.close();
    return;
  }

  try {
    const username = req.headers.user;
    await mongoClient.connect();
    const uol = mongoClient.db("batepapouol");
    const participants = uol.collection("participants");
    const messages = uol.collection("messages");
    const validate = await participants.findOne({ name: username });

    if (validate) {
      await messages.insertOne({
        ...req.body,
        from: username,
        time: dayjs(Date.now().format("HH:mm:ss")),
      });
      res.sendStatus(201);
      mongoClient.close();
    } else {
      res.sendStatus(422).send("Envie um formato válido");
      mongoClient.close();
    }
  } catch (error) {
    res.sendStatus(500);
    mongoClient.close();
  }
});

app.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit);
  const username = req.headers.user;

  try {
    await mongoClient.connect();
    const uol = mongoClient.db("batepapouol");
    const messages = uol.collection("messages");
    const chat = await messages.find({}).toArray();

    const userMsgs = chat.filter(
      (msg) => msg.to === username || msg.from === username
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
  mongoClient.close();
});

app.post("/status", async (req, res) => {
  try {
    const username = req.headers.user;
    await mongoClient.connect();
    const uol = mongoClient.db("batepapouol");
    const participants = uol.collection("participants");
    const validate = await participants.findOne({ name: username });
    if (validate) {
      await participants.updateOne(
        { _id: validate._id },
        { $set: { lastStatus: Date.now() } }
      );
      res.sendStatus(200);
      mongoClient.close();
    } else {
      res.sendStatus(404);
      mongoClient.close();
      return;
    }
  } catch (error) {
    res.sendStatus(500);
    mongoClient.close();
  }
});

setInterval(async () => {
  try {
    await mongoClient.connect();
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
    mongoClient.close();
  } catch (error) {
    console.log(error);
  }
}, 15000);

app.listen(5000, () => {
  console.log("Rodando em http://localhost:5000");
});
