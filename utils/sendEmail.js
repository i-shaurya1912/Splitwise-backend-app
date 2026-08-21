const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER ? process.env.EMAIL_USER.trim() : '',
    pass: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.trim() : '',
  },
});

const sendOTPEmail = async (toEmail, otp) => {
    await transporter.sendMail({
        from: `"BillBuddy" <${process.env.EMAIL_USER}>`,
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