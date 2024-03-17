document.addEventListener("DOMContentLoaded", function () {
  fetchStudentInfo();

  document
    .getElementById("editProfileForm")
    .addEventListener("submit", function (e) {
      e.preventDefault();
      updateStudentInfo();
    });
});

function fetchStudentInfo() {
  // Fetch student info from the server
  fetch("/api/student-info")
    .then((response) => response.json())
    .then((data) => {
      // Populate the student information on the page
      document.getElementById("studentInfo").innerHTML = `
            <p>ID: ${data.std_id}</p>
            <p>Full Name: ${data.std_fullName}</p>
            <p>Gender: ${data.std_gender}</p>
            <p>Email: ${data.std_email}</p>
            <p>Phone: ${data.std_phone}</p>
            <p>Faculty: ${data.std_faculty}</p>
            <p>Year of Study: ${data.std_year}</p>
            <p>State of Residence: ${data.std_state}</p>
            <p>Room Preference: ${data.std_pref}</p>
        `;
    });
}

// Add to the existing script
function updateStudentInfo() {
  const formData = {
    std_email: document.getElementById("std_email").value,
    std_phone: document.getElementById("std_phone").value,
    std_faculty: document.getElementById("std_faculty").value,
    std_year: document.getElementById("std_year").value,
    std_state: document.getElementById("std_state").value,
    std_pref: document.getElementById("std_pref").value,
  };

  fetch("/api/student-info", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(formData),
  })
    .then((response) => {
      if (response.ok) {
        alert("Profile updated successfully!");
        fetchStudentInfo(); // Refresh the displayed student info
      } else {
        alert("Failed to update profile. Please try again.");
      }
    })
    .catch((error) => console.error("Error updating profile:", error));
}
