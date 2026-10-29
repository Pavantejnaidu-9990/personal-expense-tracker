const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const session = require("express-session");
const bcrypt = require("bcrypt");
const User = require("./models/User");
const Budget = require("./models/Budget");
const Transaction = require("./models/Transaction");

dotenv.config();

const app = express();


// ===============================
// MIDDLEWARE
// ===============================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// ===============================
// EJS
// ===============================

app.set("view engine", "ejs");

app.set(
    "views",
    path.join(__dirname, "views")
);


// ===============================
// STATIC FILES
// ===============================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// ===============================
// SESSION
function isLoggedIn(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect("/login");
    }
}
// ===============================

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false
    })
);


// ===============================
// MONGODB CONNECTION
// ===============================


// Required configuration check
if (!process.env.MONGO_URI || !process.env.SESSION_SECRET) {
    console.error("Missing required environment variables: MONGO_URI and/or SESSION_SECRET.");
    console.error("Create a local .env file from .env.example or configure these variables in your hosting provider.");
    process.exit(1);
}

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connected successfully");
    })
    .catch((error) => {
        console.log("MongoDB connection failed:");
        console.log(error.message);
    });


// ===============================
// DASHBOARD
// ===============================

app.get("/", isLoggedIn, async (req, res) => {
    try {
        const transactions = await Transaction.find({
    user: req.session.userId
}).sort({ date: -1 });

        let totalIncome = 0;
        let totalExpenses = 0;

        transactions.forEach(transaction => {

            if (transaction.type === "income") {
                totalIncome += transaction.amount;
            }

            if (transaction.type === "expense") {
                totalExpenses += transaction.amount;
            }

        });

        const balance = totalIncome - totalExpenses;

        // Current month's budget overview
        const currentMonth = new Date().toISOString().slice(0, 7);
        const budget = await Budget.findOne({
            user: req.session.userId,
            month: currentMonth
        });

        const [year, month] = currentMonth.split("-");
        const startDate = new Date(Number(year), Number(month) - 1, 1);
        const endDate = new Date(Number(year), Number(month), 1);

        const monthlyExpenses = await Transaction.find({
            user: req.session.userId,
            type: "expense",
            date: { $gte: startDate, $lt: endDate }
        });

        const budgetAmount = budget ? Number(budget.amount) : 0;
        const budgetSpent = monthlyExpenses.reduce(
            (sum, expense) => sum + Number(expense.amount),
            0
        );
        const budgetRemaining = budgetAmount - budgetSpent;
        const budgetPercentage = budgetAmount > 0
            ? Math.min((budgetSpent / budgetAmount) * 100, 100)
            : 0;

        res.render("dashboard", {
            userName: req.session.userName,
            totalIncome: totalIncome,
            totalExpenses: totalExpenses,
            balance: balance,
            recentTransactions: transactions.slice(0, 5),
            currentMonth,
            budgetAmount,
            budgetSpent,
            budgetRemaining,
            budgetPercentage
        });

    } catch (error) {
        console.log("Dashboard error:", error);
        res.send("Failed to load dashboard");
    }
});


// ===============================
// LOGIN PAGE
// ===============================

app.get("/login", (req, res) => {

    res.render("login");

});


// ===============================
// LOGIN USER
// ===============================

app.post("/login", async (req, res) => {

    try {

        console.log("Login form data:", {
            email: req.body.email,
            password: req.body.password ? "******" : undefined
        });

        const { email, password } = req.body;

        // Check fields
        if (!email || !password) {

            return res.send(
                "Please enter email and password"
            );

        }

        // Find user
        const user = await User.findOne({
            email: email.toLowerCase().trim()
        });

        if (!user) {

            return res.send(
                "Incorrect email or password"
            );

        }

        // Compare password
        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatch) {

            return res.send(
                "Incorrect email or password"
            );

        }

        // Create session
        req.session.userId = user._id;
        req.session.userName = user.name;

        console.log(
            "User logged in successfully"
        );

        // Go to dashboard
        res.redirect("/");

    } catch (error) {

        console.log(
            "Login error:",
            error
        );

        res.send("Login failed");

    }

});


// ===============================
// REGISTER PAGE
// ===============================

app.get("/register", (req, res) => {

    res.render("register");

});
app.get("/add-expense", isLoggedIn, (req, res) => {
    res.render("add-expense");
});
app.get("/add-income", isLoggedIn, (req, res) => {
    res.render("add-income");
});
app.post("/add-income", isLoggedIn, async (req, res) => {
    try {
        const { title, amount, category, date } = req.body;

        if (!title || !amount || !category || !date) {
            return res.send("Please fill all fields");
        }

        const income = new Transaction({
            user: req.session.userId,
            type: "income",
            title: title.trim(),
            amount: Number(amount),
            category: category,
            date: new Date(date)
        });

        await income.save();

        console.log("Income added successfully");

        res.redirect("/");
    } catch (error) {
        console.log("Income error:", error);
        res.send("Failed to add income");
    }
});
// ===============================
// EXPENSES
// ===============================

app.get("/expenses", isLoggedIn, async (req, res) => {
    try {

        const { search, category, month } = req.query;

        const filter = {
            user: req.session.userId,
            type: "expense"
        };

        // Search by title
        if (search && search.trim()) {
            filter.title = {
                $regex: search.trim(),
                $options: "i"
            };
        }

        // Filter by category
        if (category && category !== "all") {
            filter.category = category;
        }

        // Filter by month
        if (month) {

            const [year, monthNumber] = month.split("-");

            const startDate = new Date(
                Number(year),
                Number(monthNumber) - 1,
                1
            );

            const endDate = new Date(
                Number(year),
                Number(monthNumber),
                1
            );

            filter.date = {
                $gte: startDate,
                $lt: endDate
            };
        }

        const expenses = await Transaction.find(filter)
            .sort({ date: -1 });


        res.render("expenses", {
            expenses: expenses,
            search: search || "",
            selectedCategory: category || "all",
            selectedMonth: month || ""
        });

    } catch (error) {

        console.log("Expenses error:", error);

        res.send("Failed to load expenses");
    }
});
app.get("/income", isLoggedIn, async (req, res) => {
    try {
        const incomes = await Transaction.find({
            user: req.session.userId,
            type: "income"
        }).sort({ date: -1 });

        res.render("income", {
            incomes: incomes
        });

    } catch (error) {
        console.log("Income error:", error);
        res.send("Failed to load income");
    }
});
// Edit income page
app.get("/edit-income/:id", isLoggedIn, async (req, res) => {
    try {
        const income = await Transaction.findOne({
            _id: req.params.id,
            user: req.session.userId,
            type: "income"
        });

        if (!income) {
            return res.send("Income not found");
        }

        res.render("edit-income", {
            income: income
        });

    } catch (error) {
        console.log("Edit income page error:", error);
        res.send("Failed to load income");
    }
});


// Update income
app.post("/edit-income/:id", isLoggedIn, async (req, res) => {
    try {
        const { title, amount, category, date } = req.body;

        if (!title || !amount || !category || !date) {
            return res.send("Please fill all fields");
        }

        await Transaction.findOneAndUpdate(
            {
                _id: req.params.id,
                user: req.session.userId,
                type: "income"
            },
            {
                title: title.trim(),
                amount: Number(amount),
                category: category,
                date: new Date(date)
            }
        );

        console.log("Income updated successfully");

        res.redirect("/income");

    } catch (error) {
        console.log("Update income error:", error);
        res.send("Failed to update income");
    }
});


// Delete income
app.post("/delete-income/:id", isLoggedIn, async (req, res) => {
    try {
        await Transaction.findOneAndDelete({
            _id: req.params.id,
            user: req.session.userId,
            type: "income"
        });

        console.log("Income deleted successfully");

        res.redirect("/income");

    } catch (error) {
        console.log("Delete income error:", error);
        res.send("Failed to delete income");
    }
});
app.post("/add-expense", isLoggedIn, async (req, res) => {
    try {
        const { title, amount, category, date } = req.body;

        if (!title || !amount || !category || !date) {
            return res.send("Please fill all fields");
        }

        const transaction = new Transaction({
            user: req.session.userId,
            type: "expense",
            title: title.trim(),
            amount: Number(amount),
            category: category,
            date: new Date(date)
        });

        await transaction.save();

        console.log("Expense added successfully");

        res.redirect("/");
    } catch (error) {
        console.log("Expense error:", error);
        res.send("Failed to add expense");
    }
});


// ===============================
// REGISTER USER
// ===============================

app.post("/register", async (req, res) => {

    try {

        const {
            name,
            email,
            password,
            confirmPassword
        } = req.body;


        // Check fields
        if (
            !name ||
            !email ||
            !password ||
            !confirmPassword
        ) {

            return res.send(
                "Please fill all fields"
            );

        }


        // Check password confirmation
        if (password !== confirmPassword) {

            return res.send(
                "Passwords do not match"
            );

        }


        // Check existing user
        const existingUser = await User.findOne({
            email: email.toLowerCase().trim()
        });

        if (existingUser) {

            return res.send(
                "Email already registered"
            );

        }


        // Hash password
        const hashedPassword =
            await bcrypt.hash(password, 10);


        // Create user
        const user = new User({

            name: name.trim(),

            email: email.toLowerCase().trim(),

            password: hashedPassword

        });


        await user.save();


        console.log(
            "User registered successfully"
        );


        // Go to login
        res.redirect("/login");


    } catch (error) {

        console.log(
            "Registration error:",
            error
        );

        res.send(
            "Registration failed"
        );

    }

});

app.get("/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.log("Logout error:", error);
            return res.send("Logout failed");
        }

        res.redirect("/login");
    });
});

// ===============================
// SETTINGS
// ===============================

app.get("/settings", isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).select("name email");

        if (!user) {
            return res.redirect("/login");
        }

        res.render("settings", {
            userName: user.name,
            email: user.email,
            message: null,
            error: null
        });
    } catch (error) {
        console.log("Settings error:", error);
        res.send("Failed to load settings");
    }
});

app.post("/settings", isLoggedIn, async (req, res) => {
    try {
        const { name, email, currentPassword, newPassword, confirmPassword } = req.body;

        if (!name || !email) {
            return res.render("settings", {
                userName: name || "",
                email: email || "",
                message: null,
                error: "Name and email are required."
            });
        }

        const user = await User.findById(req.session.userId);

        if (!user) {
            return res.redirect("/login");
        }

        const normalizedEmail = email.toLowerCase().trim();

        const existingUser = await User.findOne({
            email: normalizedEmail,
            _id: { $ne: req.session.userId }
        });

        if (existingUser) {
            return res.render("settings", {
                userName: name,
                email: normalizedEmail,
                message: null,
                error: "That email is already registered."
            });
        }

        if (newPassword || confirmPassword || currentPassword) {
            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.render("settings", {
                    userName: name,
                    email: normalizedEmail,
                    message: null,
                    error: "Fill all password fields to change your password."
                });
            }

            const passwordMatch = await bcrypt.compare(currentPassword, user.password);

            if (!passwordMatch) {
                return res.render("settings", {
                    userName: name,
                    email: normalizedEmail,
                    message: null,
                    error: "Current password is incorrect."
                });
            }

            if (newPassword.length < 6) {
                return res.render("settings", {
                    userName: name,
                    email: normalizedEmail,
                    message: null,
                    error: "New password must be at least 6 characters."
                });
            }

            if (newPassword !== confirmPassword) {
                return res.render("settings", {
                    userName: name,
                    email: normalizedEmail,
                    message: null,
                    error: "New passwords do not match."
                });
            }

            user.password = await bcrypt.hash(newPassword, 10);
        }

        user.name = name.trim();
        user.email = normalizedEmail;

        await user.save();

        req.session.userName = user.name;

        res.render("settings", {
            userName: user.name,
            email: user.email,
            message: "Settings updated successfully.",
            error: null
        });

    } catch (error) {
        console.log("Update settings error:", error);
        res.send("Failed to update settings");
    }
});

// ===============================
// START SERVER
// ===============================
app.post("/delete-expense/:id", isLoggedIn, async (req, res) => {
    try {
        await Transaction.findOneAndDelete({
            _id: req.params.id,
            user: req.session.userId,
            type: "expense"
        });

        console.log("Expense deleted successfully");

        res.redirect("/expenses");
    } catch (error) {
        console.log("Delete expense error:", error);
        res.send("Failed to delete expense");
    }
});
// Show edit expense page
app.get("/edit-expense/:id", isLoggedIn, async (req, res) => {
    try {
        const expense = await Transaction.findOne({
            _id: req.params.id,
            user: req.session.userId,
            type: "expense"
        });

        if (!expense) {
            return res.send("Expense not found");
        }

        res.render("edit-expense", {
            expense: expense
        });

    } catch (error) {
        console.log("Edit page error:", error);
        res.send("Failed to load expense");
    }
});

// Update expense
app.post("/edit-expense/:id", isLoggedIn, async (req, res) => {
    try {
        const { title, amount, category, date } = req.body;

        if (!title || !amount || !category || !date) {
            return res.send("Please fill all fields");
        }

        await Transaction.findOneAndUpdate(
            {
                _id: req.params.id,
                user: req.session.userId,
                type: "expense"
            },
            {
                title: title.trim(),
                amount: Number(amount),
                category: category,
                date: new Date(date)
            }
        );

        console.log("Expense updated successfully");

        res.redirect("/expenses");

    } catch (error) {
        console.log("Update expense error:", error);
        res.send("Failed to update expense");
    }
});

// ===============================
// REPORTS
// ===============================

// ===============================
// REPORTS
// ===============================

app.get("/reports", isLoggedIn, async (req, res) => {
    try {

        const selectedMonth = req.query.month ||
            new Date().toISOString().slice(0, 7);

        const [year, month] = selectedMonth.split("-");

        const startDate = new Date(
            Number(year),
            Number(month) - 1,
            1
        );

        const endDate = new Date(
            Number(year),
            Number(month),
            1
        );

        const transactions = await Transaction.find({
            user: req.session.userId,
            date: {
                $gte: startDate,
                $lt: endDate
            }
        }).sort({ date: -1 });


        let totalIncome = 0;
        let totalExpenses = 0;

        const categoryTotals = {};


        transactions.forEach(transaction => {

            if (transaction.type === "income") {

                totalIncome += Number(transaction.amount);

            }

            if (transaction.type === "expense") {

                totalExpenses += Number(transaction.amount);

                if (!categoryTotals[transaction.category]) {
                    categoryTotals[transaction.category] = 0;
                }

                categoryTotals[transaction.category] +=
                    Number(transaction.amount);
            }

        });


        const balance = totalIncome - totalExpenses;


        res.render("reports", {

            userName: req.session.userName,

            totalIncome,
            totalExpenses,
            balance,

            categoryTotals,

            selectedMonth

        });


    } catch (error) {

        console.log("Reports error:", error);

        res.send("Failed to load reports");

    }
});
// ===============================
// BUDGET
// ===============================

app.get("/budget", isLoggedIn, async (req, res) => {
    try {

        const selectedMonth =
            req.query.month ||
            new Date().toISOString().slice(0, 7);

        const budget = await Budget.findOne({
            user: req.session.userId,
            month: selectedMonth
        });

        const [year, month] = selectedMonth.split("-");

        const startDate = new Date(
            Number(year),
            Number(month) - 1,
            1
        );

        const endDate = new Date(
            Number(year),
            Number(month),
            1
        );

        const expenses = await Transaction.find({
            user: req.session.userId,
            type: "expense",
            date: {
                $gte: startDate,
                $lt: endDate
            }
        });

        let totalExpenses = 0;

        expenses.forEach(expense => {
            totalExpenses += Number(expense.amount);
        });

        const budgetAmount = budget ? budget.amount : 0;

        const remaining = budgetAmount - totalExpenses;

        let percentage = 0;

        if (budgetAmount > 0) {
            percentage =
                (totalExpenses / budgetAmount) * 100;
        }

        if (percentage > 100) {
            percentage = 100;
        }

        res.render("budget", {
            selectedMonth,
            budgetAmount,
            totalExpenses,
            remaining,
            percentage
        });

    } catch (error) {

        console.log("Budget error:", error);

        res.send("Failed to load budget");
    }
});


// ===============================
// SAVE / UPDATE BUDGET
// ===============================

app.post("/budget", isLoggedIn, async (req, res) => {
    try {

        const { month, amount } = req.body;

        if (!month || !amount) {
            return res.send("Please enter month and budget amount");
        }

        await Budget.findOneAndUpdate(

            {
                user: req.session.userId,
                month: month
            },

            {
                user: req.session.userId,
                month: month,
                amount: Number(amount)
            },

            {
                upsert: true,
                new: true
            }

        );

        res.redirect("/budget?month=" + month);

    } catch (error) {

        console.log("Save budget error:", error);

        res.send("Failed to save budget");
    }
});









const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {

    console.log(
        `Server running at http://localhost:${PORT}`
    );

});