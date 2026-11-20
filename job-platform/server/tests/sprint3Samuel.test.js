import test from 'node:test';
import assert from 'node:assert/strict';
import JobPosting from '../models/JobPosting.js';
import Application from '../models/Application.js';
import {
  createJob, listMyJobs, updateJob, deleteJob,
  listJobApplications, updateApplicationStatus, getStats,
} from '../controllers/recruiterController.js';
import { mockRes } from './helpers.js';

const id = '507f1f77bcf86cd799439011';
const otherId = '507f191e810c19729de860ea';
const user = { _id: id, companyName: 'ACME' };
const originals = {
  create: JobPosting.create, find: JobPosting.find, findOne: JobPosting.findOne,
  findById: JobPosting.findById, deleteMany: Application.deleteMany,
  appFind: Application.find, appFindById: Application.findById,
  aggregate: Application.aggregate,
};
test.afterEach(() => {
  JobPosting.create = originals.create;
  JobPosting.find = originals.find;
  JobPosting.findOne = originals.findOne;
  JobPosting.findById = originals.findById;
  Application.deleteMany = originals.deleteMany;
  Application.find = originals.appFind;
  Application.findById = originals.appFindById;
  Application.aggregate = originals.aggregate;
});

// Sprint 3: recruiter posting management

test('Samuel: new posting supports optional resume and number of positions', async () => {
  let captured;
  JobPosting.create = async (data) => { captured = data; return data; };
  const res = mockRes();
  await createJob({ user, body: { title: 'Engineer', description: 'Build software', resumeRequired: false, positions: '3' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(captured.resumeRequired, false);
  assert.equal(captured.positions, 3);
  assert.equal(captured.recruiter, id);
});

test('Samuel: blank positions do not override default', async () => {
  let captured;
  JobPosting.create = async (data) => { captured = data; return data; };
  await createJob({ user, body: { title: 'Engineer', description: 'Build software', positions: '' } }, mockRes());
  assert.equal(Object.hasOwn(captured, 'positions'), false);
});

test('Samuel: recruiter can close a posting without changing its ownership', async () => {
  let saved = false;
  const job = { recruiter: id, company: 'ACME', set(data) { this.changes = data; }, async save() { saved = true; } };
  JobPosting.findOne = async (query) => { assert.deepEqual(query, { _id: otherId, recruiter: id }); return job; };
  const res = mockRes();
  await updateJob({ user, params: { id: otherId }, body: { status: 'closed', recruiter: otherId, company: 'Fake' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(job.changes, { status: 'closed' });
  assert.equal(saved, true);
});

test('Samuel: failed posting save returns 400', async () => {
  JobPosting.findOne = async () => ({ set() {}, async save() { throw new Error('invalid status'); } });
  const res = mockRes();
  await updateJob({ user, params: { id: otherId }, body: { status: 'invalid' } }, res);
  assert.equal(res.statusCode, 400);
});

test('Samuel: deletion is forbidden for a posting the recruiter does not own', async () => {
  JobPosting.findOne = async (query) => { assert.equal(query.recruiter, id); return null; };
  let deleted = false;
  Application.deleteMany = async () => { deleted = true; };
  const res = mockRes();
  await deleteJob({ user, params: { id: otherId } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(deleted, false);
});

// Sprint 3: own postings and applicant review

test('Samuel: own jobs list attaches per-job application counts and zeros', async () => {
  const jobs = [{ _id: id, title: 'A' }, { _id: otherId, title: 'B' }];
  JobPosting.find = (query) => {
    assert.deepEqual(query, { recruiter: id });
    return { sort: (order) => { assert.deepEqual(order, { createdAt: -1 }); return { lean: async () => jobs }; } };
  };
  Application.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline[0].$match.job.$in, [id, otherId]);
    return [{ _id: id, count: 4 }];
  };
  const res = mockRes();
  await listMyJobs({ user }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.jobs.map((j) => j.applicationCount), [4, 0]);
});

test('Samuel: own jobs list returns empty list with no jobs', async () => {
  JobPosting.find = () => ({ sort: () => ({ lean: async () => [] }) });
  Application.aggregate = async () => [];
  const res = mockRes();
  await listMyJobs({ user }, res);
  assert.deepEqual(res.body.jobs, []);
});

test('Samuel: applicant review returns 404 for another recruiter posting', async () => {
  JobPosting.findOne = async (query) => { assert.equal(query.recruiter, id); return null; };
  let readApplications = false;
  Application.find = () => { readApplications = true; };
  const res = mockRes();
  await listJobApplications({ user, params: { id: otherId } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(readApplications, false);
});

test('Samuel: applicant review includes applicant profile and resume metadata', async () => {
  const job = { _id: otherId, title: 'Engineer' };
  const applications = [{ _id: id, status: 'submitted', applicant: { name: 'Pat', skills: ['JS'] } }];
  JobPosting.findOne = async () => job;
  Application.find = (query) => {
    assert.deepEqual(query, { job: otherId });
    return { sort: (sort) => {
      assert.deepEqual(sort, { createdAt: -1 });
      return { populate: (field, projection) => {
        assert.equal(field, 'applicant');
        assert.match(projection, /skills/);
        assert.match(projection, /resume\.originalName/);
        return { lean: async () => applications };
      } };
    } };
  };
  const res = mockRes();
  await listJobApplications({ user, params: { id: otherId } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { job, applications });
});

test('Samuel: applicant review returns 500 if database query fails', async () => {
  JobPosting.findOne = async () => ({ _id: otherId });
  Application.find = () => { throw new Error('database unavailable'); };
  const res = mockRes();
  await listJobApplications({ user, params: { id: otherId } }, res);
  assert.equal(res.statusCode, 500);
});

// Sprint 3: application status changes and statistics

test('Samuel: changing status to its current value does not save or notify', async () => {
  let saves = 0;
  const app = { _id: otherId, job: id, status: 'reviewing', async save() { saves++; } };
  Application.findById = async () => app;
  JobPosting.findOne = async () => ({ _id: id });
  JobPosting.findById = () => { throw new Error('should not look up job title'); };
  const res = mockRes();
  await updateApplicationStatus({ user, params: { id: otherId }, body: { status: 'reviewing' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(saves, 0);
  assert.equal(res.body.application.status, 'reviewing');
});

test('Samuel: malformed application id is rejected before querying database', async () => {
  Application.findById = () => { throw new Error('should not query'); };
  const res = mockRes();
  await updateApplicationStatus({ user, params: { id: 'bad-id' }, body: { status: 'hired' } }, res);
  assert.equal(res.statusCode, 404);
});

test('Samuel: statistics count only recruiter jobs and status totals', async () => {
  JobPosting.find = (query, fields) => {
    assert.deepEqual(query, { recruiter: id });
    assert.equal(fields, '_id status');
    return Promise.resolve([{ _id: id, status: 'open' }, { _id: otherId, status: 'draft' }]);
  };
  Application.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline[0].$match.job.$in, [id, otherId]);
    return [{ _id: 'submitted', count: 3 }, { _id: 'shortlisted', count: 2 }];
  };
  const res = mockRes();
  await getStats({ user }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.totalJobs, 2);
  assert.equal(res.body.openJobs, 1);
  assert.equal(res.body.totalApplications, 5);
  assert.deepEqual(res.body.applicationsByStatus, { submitted: 3, shortlisted: 2 });
});

test('Samuel: statistics return 500 when aggregation fails', async () => {
  JobPosting.find = async () => [{ _id: id, status: 'open' }];
  Application.aggregate = async () => { throw new Error('database unavailable'); };
  const res = mockRes();
  await getStats({ user }, res);
  assert.equal(res.statusCode, 500);
});
