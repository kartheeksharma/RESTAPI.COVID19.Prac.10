const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3001, () => {
      console.log("Server running at http://localhost:3001/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const convertObjToResp = (dbObj) => {
  return {
    stateId: dbObj.state_id,
    stateName: dbObj.state_name,
    population: dbObj.population,
    districtId: dbObj.district_id,
    districtName: dbObj.district_name,
    cases: dbObj.cases,
    cured: dbObj.cured,
    active: dbObj.active,
    deaths: dbObj.deaths,
  };
};

//Authentication Token
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

//1.Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT*FROM user WHERE username= '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      //username
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      //invalid password
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//2.List of all states
app.get("/states/", authenticateToken, async (request, response) => {
  const getStateQuery = `SELECT *FROM state;`;
  const getStateArr = await db.all(getStateQuery);
  response.send(getStateArr.map((each) => convertObjToResp(each)));
});

//3.State based on stateId
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const stateQuery = `SELECT *FROM state
                        WHERE state_id= ${stateId};`;
  const stateDetails = await db.get(stateQuery);
  response.send(convertObjToResp(stateDetails));
});

//4.Create district
app.post("/districts/", authenticateToken, async (request, response) => {
  const newDistrict = request.body;
  const { districtName, stateId, cases, cured, active, deaths } = newDistrict;
  const addDist = `INSERT INTO district(district_name,state_id,cases,cured,active,deaths)
                    VALUES('${districtName}', '${stateId}', '${cases}', '${cured}','${active}','${deaths}');`;
  const addDistResp = await db.run(addDist);
  const newDistDetails = addDistResp.lastID;
  response.send("District Successfully Added");
});

//5.District based on districtId
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const distQuery = `SELECT *FROM district
                        WHERE district_id= ${districtId};`;
    const distDetails = await db.get(distQuery);
    response.send(convertObjToResp(distDetails));
  }
);

//6.Delete district from district table
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const delDist = `DELETE FROM district WHERE district_id= ${districtId};`;
    await db.run(delDist);
    response.send("District Removed");
  }
);

//6.Updates details of district based on districtId
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const updateDistQuery = `UPDATE district SET
                            district_name='${districtName}',
                            state_id= '${stateId}',
                            cases= '${cases}',
                            cured='${cured}',
                            active='${active}',
                            deaths='${deaths}'
                            WHERE district_id= ${districtId};`;
    await db.run(updateDistQuery);
    response.send("District Details Updated");
  }
);

//7.Statistics of total cases of particular state
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const stateQuery = `SELECT 
                        SUM(cases),
                        SUM(cured),
                        SUM(active),
                        SUM(deaths)
                        FROM district 
                        WHERE state_id=${stateId};`;
    const stateStats = await db.get(stateQuery);
    console.log(stateStats);
    response.send({
      totalCases: stateStats["SUM(cases)"],
      totalCured: stateStats["SUM(cured)"],
      totalActive: stateStats["SUM(active)"],
      totalDeaths: stateStats["SUM(deaths)"],
    });
  }
);

module.exports = app;
