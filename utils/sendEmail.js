const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // 587 par TLS upgrade hota hai, secure:true nahi chahiye
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  family: 4, // IPv4 force karo — Render ka IPv6 issue bypass karne ke liye
});

const sendOTPEmail = async (toEmail, otp) => {
  await transporter.sendMail({
    from: `"Splitwise" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your verification code',
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Verify your email</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing: 4px;">${otp}</h1>
        <p>This code expires in 10 minutes.</p>
      </div>
    `,
  });
};

module.exports = sendOTPEmail;