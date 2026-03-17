const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "vj3032000@gmail.com",
    pass: "japu igmb ximp qpls",
  },
});

async function test() {
  await transporter.sendMail({
    from: "vj3032000@gmail.com",
    to: "vj3032000@gmail.com",
    subject: "Test Email",
    text: "This is a test email",
  });

  console.log("Email sent successfully");
}

test();
