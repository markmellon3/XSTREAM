const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.resetPassword = functions.https.onRequest(async (req, res) => {
 // Only allow POST
 if (req.method !== 'POST') {
  return res.status(405).json({ error: 'Method not allowed' });
 }
 
 try {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
   return res.status(400).json({ error: 'Missing token or password' });
  }
  
  if (newPassword.length < 6) {
   return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  // Get token document from Firestore
  const tokenDoc = await admin.firestore()
   .collection('passwordResets')
   .doc(token)
   .get();
  
  if (!tokenDoc.exists) {
   return res.status(400).json({ error: 'Invalid token' });
  }
  
  const tokenData = tokenDoc.data();
  
  // Check if already used
  if (tokenData.used) {
   return res.status(400).json({ error: 'Token already used' });
  }
  
  // Check expiration
  if (new Date(tokenData.expiresAt) < new Date()) {
   return res.status(400).json({ error: 'Token expired' });
  }
  
  // Get user by email
  const userRecord = await admin.auth()
   .getUserByEmail(tokenData.email);
  
  // Update password
  await admin.auth().updateUser(userRecord.uid, {
   password: newPassword
  });
  
  // Mark token as used
  await admin.firestore()
   .collection('passwordResets')
   .doc(token)
   .update({
    used: true,
    usedAt: admin.firestore.FieldValue.serverTimestamp()
   });
  
  return res.status(200).json({ success: true, message: 'Password updated' });
  
 } catch (error) {
  console.error('Reset password error:', error);
  
  if (error.code === 'auth/user-not-found') {
   return res.status(404).json({ error: 'User not found' });
  }
  
  return res.status(500).json({ error: 'Internal server error' });
 }
});