<template>
  <div id="login">
    <FormKit 
      type="form"
      :form-class="submitted ? 'hide' : 'show'"
      @submit="submitHandler"
    >
      <h2> Sign In to pSSID GUI 2.0 </h2>
      <FormKit
        type="text"
        name="username"
        v-model="username"
        label="Username"
        help="Enter username"
        validation="required"
        validation-visibility="live"
      />
      <FormKit
        type="password"
        label="Password"
        v-model="password"
        help="Enter password"
        prefix-icon="password"
        suffix-icon="eyeClosed"
        @suffix-icon-click="handleIconClick"
        validation="required"
        validation-visibility="live"
      />
    </FormKit>
    
  </div>
</template>

<script setup>
 let username = '';
 let password = '';

 const handleIconClick = (node, e) => {
   node.props.suffixIcon = node.props.suffixIcon === 'eye' ? 'eyeClosed' : 'eye'
   node.props.type = node.props.type === 'password' ? 'text' : 'password'
 }

 const submitHandler = async() => {
   // TODO: make request to backend 
   console.log(username + " : " + password);
   try {
     const res = await fetch(
       'http://'+ window.location.hostname + ':8000/login',
       {
         method: 'POST',
       }
     );
     const data = res.json();
   }
   catch(error) {
     console.log(error);

   }
 }

</script>
