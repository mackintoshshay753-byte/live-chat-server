const ROLE_LEVELS = {
  user: 0,
  moderator: 1,
  admin: 2,
  owner: 3
};

function getRoleById(userId, data) {
  const account = Object.values(data.accounts)
    .find(acc => acc.id === Number(userId));

  return account?.role || "user";
}

function hasRole(userId, requiredRole, data) {
  const userRole = getRoleById(userId, data);

  return (
    ROLE_LEVELS[userRole] >=
    ROLE_LEVELS[requiredRole]
  );
}

module.exports = {
  ROLE_LEVELS,
  getRoleById,
  hasRole
};