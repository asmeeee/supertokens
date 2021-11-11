import "regenerator-runtime/runtime.js";

import supertest from "supertest";

import { PrismaClient } from "@prisma/client";

import { cleanup, server } from "../src";

const requestWithSupertest = supertest(server);

const prisma = new PrismaClient();

jest.useRealTimers();

beforeEach(async () => {
  await prisma.entity.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();

  server.close();
  cleanup.stop();
});

it("GET /api/generate-random-number generates a number less than 50", async () => {
  const res = await requestWithSupertest.get("/api/generate-random-number");

  expect(res.status).toEqual(200);
  expect(res.type).toEqual(expect.stringContaining("json"));
  expect(res.body).toBeLessThanOrEqual(50);
});

it("GET /api/entity/:id/update-number should create a new entry", async () => {
  const id = 1;

  const existingEntity = await prisma.entity.findFirst({
    where: {
      id,
    },
  });

  expect(existingEntity).toBeNull();

  const res = await requestWithSupertest.get(`/api/entity/${id}/update-number`);

  const createdEntity = await prisma.entity.findFirst({
    select: {
      id: true,
      number: true,
    },

    where: {
      id,
    },
  });

  expect(createdEntity).toMatchObject({
    id: 1,
    number: 1,
  });

  expect(res.statusCode).toEqual(200);

  expect(res.body).toMatchObject({
    id: 1,
    number: 1,
  });
});

it("GET /api/entity/:id/update-number should update an existing entry", async () => {
  const id = 1;
  const number = 1;

  await prisma.entity.create({
    data: {
      id,
      number,
    },
  });

  const res = await requestWithSupertest.get(`/api/entity/${id}/update-number`);

  const updatedEntity = await prisma.entity.findFirst({
    where: {
      id,
    },
  });

  expect(updatedEntity?.number).toBeGreaterThan(number);

  expect(res.statusCode).toEqual(200);

  expect(res.body).toMatchObject({
    id,

    number: updatedEntity?.number,
  });
});

it("runs a cron clean-up task to delete some records every 30 seconds", async () => {
  // Create a bunch of records
  await Promise.all(
    [5, 8, 10, 72, 73, 78].map(async (number) => {
      await prisma.entity.create({
        data: {
          number,
        },
      });
    })
  );

  // Will do the job in 30 seconds
  cleanup.start();

  // Wait for 45 seconds for the job to surely end and check the database
  await new Promise((resolve) => setTimeout(resolve, 45000));

  const foundEntities = await prisma.entity.findMany();

  expect(foundEntities.length).toEqual(3);

  foundEntities.sort((a, b) => (a.number > b.number ? 1 : -1));

  expect(foundEntities[0].number).toEqual(5);
  expect(foundEntities[1].number).toEqual(8);
  expect(foundEntities[2].number).toEqual(73);
}, 75000);

it("runs a couple of requests for the same entity and expects only one to work at a time", async () => {
  const id = 1;
  const number = 1;

  await prisma.entity.create({
    data: {
      id,
      number,
    },
  });

  const responses = await Promise.all([
    requestWithSupertest.get(`/api/entity/${id}/update-number`),
    requestWithSupertest.get(`/api/entity/${id}/update-number`),
  ]);

  let has304 = false;

  responses.every((response) => {
    if (response.statusCode === 304) {
      has304 = true;

      return false;
    }

    return true;
  });

  expect(has304).toEqual(true);
}, 10000);
