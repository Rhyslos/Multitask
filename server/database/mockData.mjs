import crypto from 'crypto';
import { promisify } from 'util';
import { initializeDatabase } from './db.mjs';

// helper functions
const scrypt = promisify(crypto.scrypt);

// password hashing functions
async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64);
    return `${salt}:${hash.toString('hex')}`;
}

// task generation functions
function generateSubtasks(count) {
    const subtasks = [];
    for (let i = 0; i < count; i++) {
        subtasks.push({
            id: crypto.randomUUID(),
            title: `Requirement checklist item ${i + 1}`,
            isCompleted: Math.random() > 0.4 
        });
    }
    return JSON.stringify(subtasks);
}

function createTasks(listID, count, startOrder, baseTitle, colors, category) {
    const tasks = [];
    for (let i = 0; i < count; i++) {
        const hasSubtasks = Math.random() > 0.3;
        const deadlineDate = new Date(2026, 4, 1 + Math.floor(Math.random() * 25)); 
        
        tasks.push({
            id: crypto.randomUUID(),
            title: `${baseTitle} - Phase ${i + 1}`,
            description: `Detailed execution plan and notes for ${baseTitle}. Ensure all acceptance criteria are met before moving to Review.`,
            isCompleted: 0,
            originalCategory: category || '',
            color: colors[i % colors.length],
            listID: listID,
            taskOrder: startOrder + i,
            deadline: deadlineDate.toISOString(),
            subtasks: hasSubtasks ? generateSubtasks(Math.floor(Math.random() * 4) + 2) : null
        });
    }
    return tasks;
}

// ID generation functions
const u1 = crypto.randomUUID();
const u2 = crypto.randomUUID();
const u3 = crypto.randomUUID();
const u4 = crypto.randomUUID();
const u5 = crypto.randomUUID();

const cat1 = crypto.randomUUID();
const ws1 = crypto.randomUUID();

const tab1 = crypto.randomUUID();
const tab2 = crypto.randomUUID();
const tab3 = crypto.randomUUID();
const tab4 = crypto.randomUUID();

const col1 = crypto.randomUUID();
const col2 = crypto.randomUUID();
const col3 = crypto.randomUUID();
const col4 = crypto.randomUUID();

const list1 = crypto.randomUUID();
const list2 = crypto.randomUUID();
const list3 = crypto.randomUUID();
const list4 = crypto.randomUUID();
const list5 = crypto.randomUUID();
const list6 = crypto.randomUUID();
const list7 = crypto.randomUUID();

const grp1 = crypto.randomUUID();
const grp2 = crypto.randomUUID();
const grp3 = crypto.randomUUID();

const pg1 = crypto.randomUUID();
const pg2 = crypto.randomUUID();
const pg3 = crypto.randomUUID();
const pg4 = crypto.randomUUID();

// mock data generation functions
export async function seedMockData() {
    const db = await initializeDatabase();
    
    // user functions
    const pwdHash = await hashPassword('Test1234');

    // database insertion functions
    await db.run(`
        INSERT INTO users (id, email, password_hash, displayName, firstName, lastName, jobTitle, countryCode)
        VALUES
        (?, 'test1@uia.no', ?, 'Board Owner', 'Alice', 'Smith', 'Project Manager', 'NO'),
        (?, 'test2@uia.no', ?, 'Dev Bob', 'Bob', 'Jones', 'Frontend Developer', 'NO'),
        (?, 'test3@uia.no', ?, 'Dev Charlie', 'Charlie', 'Brown', 'Backend Developer', 'NO'),
        (?, 'test4@uia.no', ?, 'Tester Dave', 'Dave', 'Williams', 'QA Engineer', 'NO'),
        (?, 'test5@uia.no', ?, 'Design Eve', 'Eve', 'Davis', 'UI/UX Designer', 'NO')
    `, [u1, pwdHash, u2, pwdHash, u3, pwdHash, u4, pwdHash, u5, pwdHash]);

    await db.run(`
        INSERT INTO categories (id, name, color, userID)
        VALUES (?, 'Finance Projects', '#10B981', ?)
    `, [cat1, u1]);

    await db.run(`
        INSERT INTO workspaces (id, name, userID, categoryID)
        VALUES (?, 'Banking App V2', ?, ?)
    `, [ws1, u1, cat1]);

    await db.run(`
        INSERT INTO workspace_members (id, workspaceID, userID, role)
        VALUES
        (?, ?, ?, 'editor'),
        (?, ?, ?, 'editor'),
        (?, ?, ?, 'viewer')
    `, [
        crypto.randomUUID(), ws1, u2, 
        crypto.randomUUID(), ws1, u3,
        crypto.randomUUID(), ws1, u4
    ]);

    await db.run(`
        INSERT INTO kanban_tabs (id, name, color, tabOrder, workspaceID)
        VALUES
        (?, 'Development', '#3498DB', 0, ?),
        (?, 'Testing Tracker', '#9B59B6', 1, ?),
        (?, 'Security Audit', '#E74C3C', 2, ?),
        (?, 'Mobile App UX', '#F1C40F', 3, ?)
    `, [tab1, ws1, tab2, ws1, tab3, ws1, tab4, ws1]);

    await db.run(`
        INSERT INTO kanban_columns (id, tabID, workspaceID, columnIndex)
        VALUES
        (?, ?, ?, 0),
        (?, ?, ?, 1),
        (?, ?, ?, 0),
        (?, ?, ?, 0)
    `, [col1, tab1, ws1, col2, tab1, ws1, col3, tab2, ws1, col4, tab4, ws1]);

    await db.run(`
        INSERT INTO lists (id, name, category, color, direction, listOrder, columnID, workspaceID, tabID)
        VALUES
        (?, 'To Do', 'planning', '#94A3B8', 'vertical', 0, ?, ?, ?),
        (?, 'In Progress', 'active', '#3B82F6', 'vertical', 1, ?, ?, ?),
        (?, 'Blocked', 'urgent', '#EF4444', 'vertical', 0, ?, ?, ?),
        (?, 'Review', 'qa', '#10B981', 'horizontal', 1, ?, ?, ?),
        (?, 'Alpha Group Tickets', 'testing', '#8B5CF6', 'vertical', 0, ?, ?, ?),
        (?, 'Beta Group Feedback', 'testing', '#EC4899', 'horizontal', 1, ?, ?, ?),
        (?, 'UI Drafts', 'design', '#F59E0B', 'horizontal', 0, ?, ?, ?)
    `, [
        list1, col1, ws1, tab1,
        list2, col1, ws1, tab1,
        list3, col2, ws1, tab1,
        list4, col2, ws1, tab1,
        list5, col3, ws1, tab2,
        list6, col3, ws1, tab2,
        list7, col4, ws1, tab4
    ]);

    // array mapping functions
    const allTasks = [
        ...createTasks(list1, 6, 0, 'Design DB Schema', ['#94A3B8', '#64748B'], 'planning'),
        ...createTasks(list2, 4, 0, 'Implement Accounts API', ['#3B82F6', '#2563EB'], 'development'),
        ...createTasks(list3, 3, 0, 'OAuth Gateway Timeout', ['#EF4444', '#DC2626'], 'blocker'),
        ...createTasks(list4, 8, 0, 'PR Review: Ledger Sync', ['#10B981', '#059669'], 'review'),
        ...createTasks(list5, 5, 0, 'Alpha: Login crash on iOS', ['#8B5CF6', '#7C3AED'], 'bug'),
        ...createTasks(list6, 5, 0, 'Beta: Typography too small', ['#EC4899', '#DB2777'], 'feedback'),
        ...createTasks(list7, 6, 0, 'Wireframe Dashboard', ['#F59E0B', '#D97706'], 'design')
    ];

    for (const t of allTasks) {
        await db.run(`
            INSERT INTO tasks (id, title, description, isCompleted, originalCategory, color, listID, taskOrder, deadline, subtasks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [t.id, t.title, t.description, t.isCompleted, t.originalCategory, t.color, t.listID, t.taskOrder, t.deadline, t.subtasks]);
    }

    await db.run(`
        INSERT INTO notation_groups (id, name, color, workspaceID, groupOrder)
        VALUES
        (?, 'API Documentation', '#3B82F6', ?, 0),
        (?, 'Design Assets', '#D946EF', ?, 1),
        (?, 'Internal Documents', '#10B981', ?, 2)
    `, [grp1, ws1, grp2, ws1, grp3, ws1]);

    await db.run(`
        INSERT INTO notation_pages (id, title, workspaceID, groupID, pageOrder)
        VALUES
        (?, 'Transactions Endpoints v2', ?, ?, 0),
        (?, 'Color Palette & Typography', ?, ?, 0),
        (?, 'Employee Onboarding Specs', ?, ?, 0),
        (?, 'QA Testing Matrix', ?, ?, 1)
    `, [pg1, ws1, grp1, pg2, ws1, grp2, pg3, ws1, grp3, pg4, ws1, grp3]);

    // database insertion functions
    await db.run(`
        INSERT INTO notes (id, content, workspaceID)
        VALUES
        (?, ?, ?),
        (?, ?, ?),
        (?, ?, ?),
        (?, ?, ?)
    `, [
        pg1, JSON.stringify({
            type: "doc",
            content: [
                { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Transactions API Endpoints" }] },
                { type: "paragraph", content: [{ type: "text", text: "This document outlines the v2 endpoints for handling user transactions, including transfers, deposits, and webhooks for external payment gateways." }] },
                { type: "bulletList", content: [
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "POST /api/transactions/transfer" }] }] },
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "GET /api/transactions/history" }] }] },
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "POST /api/webhooks/stripe" }] }] }
                ]}
            ]
        }), ws1,
        
        pg2, JSON.stringify({
            type: "doc",
            content: [
                { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Mobile App UI Guidelines" }] },
                { type: "paragraph", content: [{ type: "text", text: "The new mobile application must adhere strictly to the WCAG 2.1 AA accessibility standards. Primary colors are mapped to the brand identity." }] }
            ]
        }), ws1,
        
        pg3, JSON.stringify({
            type: "doc",
            content: [
                { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Internal Onboarding" }] },
                { type: "paragraph", content: [{ type: "text", text: "Welcome to the Banking App V2 project. All new developers must clone the repository, run the initialization script, and review the kanban board before their first standup." }] },
                { type: "orderedList", content: [
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Clone repo" }] }] },
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Run npm install" }] }] },
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Start docker containers" }] }] }
                ]}
            ]
        }), ws1,
        
        pg4, JSON.stringify({
            type: "doc",
            content: [
                { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "QA Testing Matrix for Alpha/Beta" }] },
                { type: "paragraph", content: [{ type: "text", text: "Ensure all Alpha group members test the OAuth flow across Chrome, Safari, and Firefox. Beta group will focus entirely on the native mobile app experience on iOS and Android." }] }
            ]
        }), ws1
    ]);

    console.log("Full-featured mock data generated successfully!");
}

seedMockData().catch(console.error);