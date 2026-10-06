require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/course_registration_db';

// 1. Define Mongoose Schemas (Many-to-Many Relationship)
const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  courses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }]
});

const courseSchema = new mongoose.Schema({
  courseName: { type: String, required: true },
  maxStudents: { type: Number, required: true },
  availableSlots: { type: Number, required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }]
});

const Student = mongoose.model('Student', studentSchema);
const Course = mongoose.model('Course', courseSchema);

// 2. Course Enrollment Function
async function enrollCourse(studentId, courseId) {
  const student = await Student.findById(studentId);
  const course = await Course.findById(courseId);

  if (!student || !course) {
    throw new Error('Student or Course not found');
  }

  const alreadyEnrolled = student.courses.some(
    (cId) => cId.toString() === courseId.toString()
  );
  if (alreadyEnrolled) {
    throw new Error(`Student "${student.name}" is already enrolled in this course`);
  }

  if (course.availableSlots <= 0) {
    throw new Error(`Course "${course.courseName}" is full (availableSlots = 0)`);
  }

  // Update bidirectional relationship and decrement available slots
  student.courses.push(course._id);
  course.students.push(student._id);
  course.availableSlots -= 1;

  await student.save();
  await course.save();

  console.log(`-> [ENROLL SUCCESS] Student "${student.name}" enrolled in "${course.courseName}". Remaining slots: ${course.availableSlots}`);
}

// 3. Course Drop Function
async function dropCourse(studentId, courseId) {
  const student = await Student.findById(studentId);
  const course = await Course.findById(courseId);

  if (!student || !course) {
    throw new Error('Student or Course not found');
  }

  const isEnrolled = student.courses.some(
    (cId) => cId.toString() === courseId.toString()
  );
  if (!isEnrolled) {
    throw new Error(`Student "${student.name}" is not enrolled in course "${course.courseName}"`);
  }

  // Remove references on both models and increment available slots
  student.courses = student.courses.filter(
    (cId) => cId.toString() !== courseId.toString()
  );
  course.students = course.students.filter(
    (sId) => sId.toString() !== studentId.toString()
  );
  course.availableSlots += 1;

  await student.save();
  await course.save();

  console.log(`-> [DROP SUCCESS] Student "${student.name}" dropped course "${course.courseName}". Remaining slots: ${course.availableSlots}`);
}

// 4. Automated Test Scenarios
async function main() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('=== DATABASE CONNECTION ESTABLISHED ===');

    // Reset collections for testing
    await Student.deleteMany({});
    await Course.deleteMany({});

    // Seed mock data
    const course = await Course.create({
      courseName: 'CSBU109 - Web Application Development',
      maxStudents: 2,
      availableSlots: 2,
      students: []
    });

    const student1 = await Student.create({ name: 'Thanh The', email: 'thanhthe@example.com', courses: [] });
    const student2 = await Student.create({ name: 'Alex Johnson', email: 'alex@example.com', courses: [] });
    const student3 = await Student.create({ name: 'Maria Garcia', email: 'maria@example.com', courses: [] });

    console.log('\n--- TEST CASE 1: VALID ENROLLMENTS ---');
    await enrollCourse(student1._id, course._id);
    await enrollCourse(student2._id, course._id);

    console.log('\n--- TEST CASE 2: DUPLICATE ENROLLMENT CHECK ---');
    try {
      await enrollCourse(student1._id, course._id);
    } catch (err) {
      console.log('Caught expected error:', err.message);
    }

    console.log('\n--- TEST CASE 3: CAPACITY LIMIT CHECK ---');
    try {
      await enrollCourse(student3._id, course._id);
    } catch (err) {
      console.log('Caught expected error:', err.message);
    }

    console.log('\n--- TEST CASE 4: COURSE DROP ---');
    await dropCourse(student1._id, course._id);

    console.log('\n--- TEST CASE 5: VERIFY UPDATED STATE ---');
    const updatedCourse = await Course.findById(course._id).populate('students', 'name email');
    console.log(`Remaining slots: ${updatedCourse.availableSlots}`);
    console.log('Enrolled students:', updatedCourse.students);

  } catch (err) {
    console.error('Execution Error:', err.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n=== DATABASE CONNECTION CLOSED ===');
  }
}

main();