import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./JobSearch.css";

const jobs = [
  {
    id: "frontend-engineer-northstar",
    title: "Frontend Engineer",
    company: "Northstar Health",
    initials: "NH",
    location: "Montreal, QC",
    category: "Engineering",
    type: "Full-time",
    salary: "$95k–$125k",
    posted: "2 days ago",
    description: "Build clear, accessible digital products that help people navigate their health. You will work closely with design, product, and backend engineering to turn complex workflows into thoughtful interfaces.",
    responsibilities: ["Build and maintain responsive React applications", "Partner with design to ship accessible user experiences", "Improve performance, testing, and frontend standards"],
    requirements: ["3+ years building production web applications", "Strong JavaScript, React, and CSS fundamentals", "Comfort collaborating across a multidisciplinary team"],
  },
  {
    id: "product-designer-fieldwork",
    title: "Product Designer",
    company: "Fieldwork",
    initials: "FW",
    location: "Remote · Canada",
    category: "Design",
    type: "Full-time",
    salary: "$88k–$112k",
    posted: "1 day ago",
    description: "Shape the tools independent teams use to plan and deliver their best work. From early research through polished interaction details, you will have a voice in the product from day one.",
    responsibilities: ["Lead discovery and define product opportunities", "Create flows, prototypes, and detailed interface designs", "Use customer feedback and product data to iterate"],
    requirements: ["A portfolio showing end-to-end product design work", "Experience with research and prototyping methods", "Clear communication and strong systems thinking"],
  },
  {
    id: "data-analyst-mapleline",
    title: "Data Analyst",
    company: "Mapleline Financial",
    initials: "MF",
    location: "Toronto, ON",
    category: "Data & Analytics",
    type: "Full-time",
    salary: "$78k–$98k",
    posted: "3 days ago",
    description: "Turn customer and operational data into decisions people can act on. You will build trusted reporting, investigate trends, and help teams ask better questions.",
    responsibilities: ["Develop dashboards and recurring reports", "Analyze trends and explain findings to partners", "Work with data engineering to improve data quality"],
    requirements: ["Fluency in SQL and a visualization tool", "Experience with statistical analysis", "Careful, curious approach to ambiguous problems"],
  },
  {
    id: "community-manager-common-ground",
    title: "Community Manager",
    company: "Common Ground",
    initials: "CG",
    location: "Montreal, QC",
    category: "Marketing",
    type: "Full-time",
    salary: "$62k–$78k",
    posted: "4 days ago",
    description: "Bring a growing community together around more sustainable ways to live. You will create useful conversations, develop local partnerships, and make members feel at home.",
    responsibilities: ["Plan a steady calendar of community programming", "Build relationships with members and local partners", "Track engagement and share what the community needs"],
    requirements: ["Experience in community, events, or customer engagement", "Excellent writing and interpersonal skills", "Fluent in English; French is an asset"],
  },
  {
    id: "backend-developer-orbit",
    title: "Backend Developer",
    company: "Orbit Logistics",
    initials: "OL",
    location: "Ottawa, ON · Hybrid",
    category: "Engineering",
    type: "Full-time",
    salary: "$105k–$135k",
    posted: "5 days ago",
    description: "Help modernize the systems that move goods across the country. You will design reliable services and APIs that power real-time logistics for customers and operations teams.",
    responsibilities: ["Design and operate secure REST APIs and services", "Improve system reliability and observability", "Contribute to architecture and engineering reviews"],
    requirements: ["Experience with Node.js or another backend runtime", "Knowledge of databases, API design, and cloud services", "A practical focus on reliability and maintainability"],
  },
  {
    id: "people-operations-coordinator-lumen",
    title: "People Operations Coordinator",
    company: "Lumen Learning",
    initials: "LL",
    location: "Remote · Canada",
    category: "People & Operations",
    type: "Contract",
    salary: "$58k–$70k",
    posted: "1 week ago",
    description: "Make the everyday employee experience run smoothly for a distributed learning company. You will keep people programs organized, welcoming, and easy to navigate.",
    responsibilities: ["Coordinate onboarding and employee programs", "Maintain accurate people documentation and systems", "Support an inclusive and responsive employee experience"],
    requirements: ["Strong organization and attention to detail", "Experience supporting people or operations programs", "Comfort handling confidential information with care"],
  },
];

const categories = [...new Set(jobs.map((job) => job.category))].sort();
const locations = [...new Set(jobs.map((job) => job.location))].sort();

export default function JobSearch() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("");
  const selectedJob = jobs.find((job) => job.id === jobId);
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredJobs = jobs.filter((job) => {
    const searchableText = `${job.title} ${job.company} ${job.description} ${job.category}`.toLowerCase();
    return (!normalizedKeyword || searchableText.includes(normalizedKeyword))
      && (!location || job.location === location)
      && (!category || job.category === category);
  });

  const resetFilters = () => {
    setKeyword("");
    setLocation("");
    setCategory("");
  };

  if (jobId) {
    if (!selectedJob) {
      return (
        <main className="jobs-shell">
          <SiteHeader user={user} />
          <section className="job-not-found">
            <p className="eyebrow">Listing unavailable</p>
            <h1>This role may have moved on.</h1>
            <Link className="text-link" to="/jobs">Browse all openings</Link>
          </section>
        </main>
      );
    }

    return (
      <main className="jobs-shell">
        <SiteHeader user={user} />
        <section className="detail-wrap">
          <button className="back-link" onClick={() => navigate("/jobs")} type="button">
            <span aria-hidden="true">←</span> All openings
          </button>
          <article className="job-detail">
            <div className="detail-heading">
              <div className="company-mark large-mark">{selectedJob.initials}</div>
              <div>
                <p className="eyebrow">{selectedJob.company}</p>
                <h1>{selectedJob.title}</h1>
                <p className="detail-meta">{selectedJob.location} <span>·</span> {selectedJob.type} <span>·</span> {selectedJob.posted}</p>
              </div>
              <span className="salary detail-salary">{selectedJob.salary}</span>
            </div>
            <div className="detail-body">
              <section>
                <h2>About the role</h2>
                <p>{selectedJob.description}</p>
              </section>
              <section>
                <h2>What you’ll do</h2>
                <ul>{selectedJob.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
              <section>
                <h2>What you bring</h2>
                <ul>{selectedJob.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
              <div className="detail-footer">
                <span>Listed {selectedJob.posted} <span aria-hidden="true">·</span> {selectedJob.category}</span>
              </div>
            </div>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="jobs-shell">
      <SiteHeader user={user} />
      <section className="jobs-intro">
        <div className="intro-copy">
          <p className="eyebrow">A better next step starts here</p>
          <h1>Find work that<br /><em>moves you forward.</em></h1>
          <p className="intro-description">Thoughtful opportunities from teams building what’s next.</p>
        </div>
        <div className="intro-note"><span className="note-number">0{jobs.length}</span><span>open roles<br />to explore</span></div>
      </section>

      <section className="search-section" aria-label="Search and filter job listings">
        <div className="search-panel">
          <label className="filter-field keyword-field">
            <span>Keywords</span>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Title, company, or skill" />
          </label>
          <label className="filter-field">
            <span>Location</span>
            <select value={location} onChange={(event) => setLocation(event.target.value)}>
              <option value="">Anywhere</option>
              {locations.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="filter-field">
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button className="search-button" type="button" onClick={() => document.querySelector(".job-results")?.scrollIntoView({ behavior: "smooth" })}>
            Search openings <span aria-hidden="true">↘</span>
          </button>
        </div>
      </section>

      <section className="job-results" aria-live="polite">
        <div className="results-heading">
          <div><p className="eyebrow">The latest opportunities</p><h2>Open positions <span>{filteredJobs.length.toString().padStart(2, "0")}</span></h2></div>
          {(keyword || location || category) && <button className="clear-filters" onClick={resetFilters} type="button">Clear filters <span aria-hidden="true">×</span></button>}
        </div>

        {filteredJobs.length ? (
          <div className="job-list">
            {filteredJobs.map((job, index) => (
              <Link className="job-row" key={job.id} to={`/jobs/${job.id}`} style={{ "--row-index": index }}>
                <div className={`company-mark mark-${index % 4}`}>{job.initials}</div>
                <div className="job-main">
                  <div className="job-title-line"><h3>{job.title}</h3><span className="job-type">{job.type}</span></div>
                  <p>{job.company} <span>·</span> {job.location}</p>
                </div>
                <div className="job-category">{job.category}</div>
                <div className="job-compensation"><strong>{job.salary}</strong><span>{job.posted}</span></div>
                <span className="row-arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state"><p className="eyebrow">No matches this time</p><h3>Try widening your search.</h3><p>Remove a filter or search for a different title, company, or skill.</p><button className="text-link" onClick={resetFilters} type="button">Reset search</button></div>
        )}
      </section>
      <footer className="jobs-footer"><span>CareerConnect</span><span>Good work starts with a good fit.</span></footer>
    </main>
  );
}

function SiteHeader({ user }) {
  return (
    <header className="site-header">
      <Link className="wordmark" to="/jobs"><span className="wordmark-symbol">C</span>careerconnect</Link>
      <nav aria-label="Main navigation">
        <Link className="nav-current" to="/jobs">Find a job</Link>
        {user ? <Link to="/dashboard">My dashboard</Link> : <Link to="/login">Sign in</Link>}
      </nav>
    </header>
  );
}